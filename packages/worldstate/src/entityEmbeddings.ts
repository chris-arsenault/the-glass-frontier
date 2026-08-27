import type {
  HardStateKind,
  HardStateProminence,
} from '@glass-frontier/dto';
import type { Pool } from 'pg';

const EMBEDDING_MODEL = 'cohere.embed-v4:0';

/**
 * The width of `entity.embedding`, which is this layer's contract rather than
 * the embedding provider's: worldstate does not know or care which model wrote
 * a vector, only that it fits the column. Changing it means a migration and a
 * full re-embed, because vectors of different widths describe different spaces
 * and a similarity between them is noise.
 */
export const ENTITY_EMBEDDING_DIMENSIONS = 1024;
const MAX_GRAPH_HOPS = 8;

export type EntityEmbeddingSource = {
  id: string;
  text: string;
};

export type SubjectEntityCandidate = {
  hops: number | null;
  id: string;
  kind: HardStateKind;
  name: string;
  prominence: HardStateProminence;
  reach: number;
  score: number;
  similarity: number;
  slug: string;
};

export type ReferenceEntityCandidate = {
  id: string;
  name: string;
  similarity: number;
  slug: string;
};

export type EntitySearchCandidate = {
  id: string;
  kind: HardStateKind;
  name: string;
  similarity: number;
  slug: string;
};

type SubjectCandidateRow = Omit<SubjectEntityCandidate, 'reach'> & {
  reach: number | null;
};

const vectorLiteral = (embedding: number[]): string => `[${embedding.join(',')}]`;

const SUBJECT_CANDIDATE_QUERY = `
WITH RECURSIVE
seeds AS (
  SELECT e.id, 0 AS hops, 1.0::real AS reach, ARRAY[e.id]::uuid[] AS path
  FROM entity e
  WHERE e.id = ANY($3::uuid[])
    AND NOT e.is_article
),
walk AS (
  SELECT id, hops, reach, path FROM seeds
  UNION ALL
  SELECT nxt.id, walk.hops + 1,
    (walk.reach * COALESCE(edge.strength, kind.default_strength))::real,
    walk.path || nxt.id
  FROM walk
  JOIN edge ON edge.src_id = walk.id OR edge.dst_id = walk.id
  JOIN world_relationship_kind kind ON kind.id = edge.type
  JOIN LATERAL (
    SELECT CASE WHEN edge.src_id = walk.id THEN edge.dst_id ELSE edge.src_id END AS id
  ) nxt ON true
  JOIN entity next_entity ON next_entity.id = nxt.id AND NOT next_entity.is_article
  WHERE walk.hops < ${MAX_GRAPH_HOPS}
    AND kind.category <> 'banned'
    AND COALESCE((edge.props ->> 'live')::boolean, true)
    AND NOT nxt.id = ANY(walk.path)
    AND walk.reach * COALESCE(edge.strength, kind.default_strength) > 0.05
),
best AS (
  SELECT id, MIN(hops) AS hops, MAX(reach) AS reach
  FROM walk
  GROUP BY id
),
candidates AS (
  SELECT e.id, e.slug, e.name, e.kind, e.prominence,
    best.hops, COALESCE(best.reach, 0)::real AS reach,
    (1 - (e.embedding <=> $1::vector))::real AS similarity,
    prominence.rank
  FROM entity e
  JOIN world_prominence prominence ON prominence.id = e.prominence
  LEFT JOIN best ON best.id = e.id
  WHERE e.embedding IS NOT NULL
    AND NOT e.is_article
    AND e.kind = $2
    AND (
      cardinality($3::uuid[]) = 0
      OR (
        best.id IS NOT NULL
        AND best.hops <= CASE e.prominence
          WHEN 'forgotten' THEN 1
          WHEN 'marginal' THEN 2
          WHEN 'recognized' THEN 4
          WHEN 'renowned' THEN 6
          WHEN 'mythic' THEN 8
        END
      )
    )
  ORDER BY e.embedding <=> $1::vector
  LIMIT 12
)
SELECT id, slug, name, kind, prominence, hops, reach, similarity,
  (similarity * 0.75 + reach * 0.2 + rank * 0.0125)::real AS score
FROM candidates
ORDER BY score DESC, similarity DESC
LIMIT $4`;

/**
 * A null candidate list searches the whole player-visible entity space. The
 * reference resolver used to be handed a pre-scored slice, so a player naming
 * something the slice had not reached went unresolved; canon it has never
 * heard of is exactly what a player is most likely to name.
 */
const REFERENCE_CANDIDATE_QUERY = `
SELECT e.id, e.slug, e.name,
  (1 - (e.embedding <=> $1::vector))::real AS similarity
FROM entity e
WHERE e.embedding IS NOT NULL
  AND ($2::uuid[] IS NULL OR e.id = ANY($2::uuid[]))
  AND NOT e.is_article
  AND NOT e.dm
ORDER BY e.embedding <=> $1::vector
LIMIT $3`;

export class EntityEmbeddingReader {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async hasEmbeddings(kind: HardStateKind): Promise<boolean> {
    const result = await this.#pool.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM entity WHERE kind = $1 AND embedding IS NOT NULL
       ) AS exists`,
      [kind]
    );
    return result.rows[0]?.exists ?? false;
  }

  async listMissing(limit = 100): Promise<EntityEmbeddingSource[]> {
    const result = await this.#pool.query<{ id: string; text: string }>(
      `SELECT id,
         concat_ws(E'\n', name, 'kind: ' || kind, nullif(description, '')) AS text
       FROM entity
       WHERE embedding IS NULL
       ORDER BY created_at ASC
       LIMIT $1`,
      [Math.max(1, Math.min(limit, 500))]
    );
    return result.rows;
  }

  async save(id: string, embedding: number[]): Promise<void> {
    // Postgres would reject this too, but only from inside a batch of sixteen
    // where the message names neither the entity nor the width it got.
    if (embedding.length !== ENTITY_EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Entity ${id} embedding is ${embedding.length} wide; the column holds `
        + `${ENTITY_EMBEDDING_DIMENSIONS}.`
      );
    }
    await this.#pool.query(
      `UPDATE entity
       SET embedding = $2::vector, embedding_model = $3, embedding_updated_at = now()
       WHERE id = $1::uuid`,
      [id, vectorLiteral(embedding), EMBEDDING_MODEL]
    );
  }

  async findSubjectCandidates(input: {
    embedding: number[];
    focusIds: string[];
    kind: HardStateKind;
    limit?: number;
  }): Promise<SubjectEntityCandidate[]> {
    const result = await this.#pool.query<SubjectCandidateRow>(
      SUBJECT_CANDIDATE_QUERY,
      [
        vectorLiteral(input.embedding),
        input.kind,
        [...new Set(input.focusIds)],
        Math.max(1, Math.min(input.limit ?? 5, 12)),
      ]
    );
    return result.rows.map((row) => ({
      ...row,
      reach: row.reach ?? 0,
    }));
  }

  /**
   * Global semantic entity discovery, unrestricted by a candidate set.
   * Player-facing: DM-only and article entities are excluded.
   */
  async findEntityCandidates(input: {
    embedding: number[];
    limit?: number;
  }): Promise<EntitySearchCandidate[]> {
    const result = await this.#pool.query<EntitySearchCandidate>(
      `SELECT e.id, e.slug, e.name, e.kind,
         (1 - (e.embedding <=> $1::vector))::real AS similarity
       FROM entity e
       WHERE e.embedding IS NOT NULL
         AND NOT e.is_article
         AND NOT e.dm
       ORDER BY e.embedding <=> $1::vector
       LIMIT $2`,
      [vectorLiteral(input.embedding), Math.max(1, Math.min(input.limit ?? 5, 12))]
    );
    return result.rows;
  }

  /** Omit `candidateIds` to search all player-visible entities. */
  async findReferenceCandidates(input: {
    candidateIds?: string[];
    embedding: number[];
    limit?: number;
  }): Promise<ReferenceEntityCandidate[]> {
    const result = await this.#pool.query<ReferenceEntityCandidate>(
      REFERENCE_CANDIDATE_QUERY,
      [
        vectorLiteral(input.embedding),
        input.candidateIds === undefined ? null : [...new Set(input.candidateIds)],
        Math.max(1, Math.min(input.limit ?? 5, 12)),
      ]
    );
    return result.rows;
  }
}
