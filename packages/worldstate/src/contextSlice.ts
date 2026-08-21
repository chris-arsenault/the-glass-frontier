import type {
  ContextSliceEntity,
  ContextSliceInput,
  HardStateKind,
  HardStateProminence,
  HardStateStatus,
  HardStateSubkind,
} from '@glass-frontier/dto';
import type { Pool } from 'pg';

import { normalizeTags } from './utils';

type SliceRow = {
  id: string;
  slug: string;
  kind: HardStateKind;
  subkind: HardStateSubkind | null;
  name: string;
  description: string | null;
  prominence: HardStateProminence;
  status: HardStateStatus | null;
  props: { facts?: Record<string, string | number> } | null;
  hops: number;
  reach: number;
  tag_overlap: number;
  score: number;
  tags: string[] | null;
  lore: Array<{ slug: string; summary: string; tags: string[]; title: string }> | null;
};

/**
 * The per-turn context query.
 *
 * Walks out from the focus set along edges weighted by
 * `COALESCE(edge.strength, world_relationship_kind.default_strength)`, keeps the
 * strongest path to each entity, scores it, and attaches its most recent lore —
 * all in one statement. Replaces a per-entity fetch loop in the GM engine.
 *
 * Scoring, highest first:
 *   reach       weighted path strength from the focus set (anchor starts at 1.0)
 *   anchor      +2.0 for the chronicle's anchor entity
 *   focus       +1.0 for an entity the recent turns leaned on
 *   tag overlap +0.4 per shared tag with the chronicle's active tags
 *   prominence  +0.1 per tier, so a famous name breaks ties toward itself
 */
const CONTEXT_SLICE_QUERY = `
WITH RECURSIVE
seeds AS (
  SELECT e.id, 0 AS hops,
    CASE WHEN e.id = $1::uuid THEN 1.0 ELSE 0.8 END::real AS reach
  FROM entity e
  WHERE e.id = ANY($2::uuid[])
),
walk AS (
  SELECT s.id, s.hops, s.reach FROM seeds s
  UNION ALL
  SELECT nxt.id, w.hops + 1,
    (w.reach * COALESCE(edge.strength, wrk.default_strength))::real
  FROM walk w
  JOIN edge ON edge.src_id = w.id OR edge.dst_id = w.id
  JOIN world_relationship_kind wrk ON wrk.id = edge.type
  JOIN LATERAL (
    SELECT CASE WHEN edge.src_id = w.id THEN edge.dst_id ELSE edge.src_id END AS id
  ) nxt ON true
  WHERE w.hops < $3
    AND wrk.category <> 'banned'
    AND w.reach * COALESCE(edge.strength, wrk.default_strength) > 0.05
),
best AS (
  SELECT id, MIN(hops) AS hops, MAX(reach) AS reach
  FROM walk GROUP BY id
),
scored AS (
  SELECT b.id, b.hops, b.reach,
    COALESCE(cardinality(ARRAY(
      SELECT DISTINCT tag FROM lore_fragment lf, unnest(lf.tags) AS tag
      WHERE lf.entity_id = b.id AND tag = ANY($4::text[])
    )), 0) AS tag_overlap
  FROM best b
)
SELECT e.id, e.slug, e.kind, e.subkind, e.name, e.description, e.prominence,
  e.status, e.props, s.hops, s.reach, s.tag_overlap,
  (s.reach
    + CASE WHEN e.id = $1::uuid THEN 2.0 ELSE 0 END
    + CASE WHEN e.id = ANY($2::uuid[]) THEN 1.0 ELSE 0 END
    + s.tag_overlap * 0.4
    + wp.rank * 0.1
  )::real AS score,
  ARRAY(
    SELECT DISTINCT tag FROM lore_fragment lf, unnest(lf.tags) AS tag
    WHERE lf.entity_id = e.id
  ) AS tags,
  COALESCE((
    SELECT jsonb_agg(fragment ORDER BY fragment ->> 'created_at' DESC)
    FROM (
      SELECT jsonb_build_object(
        'slug', lf.slug,
        'title', lf.title,
        'summary', left(lf.prose, 240),
        'tags', to_jsonb(lf.tags),
        'created_at', lf.created_at
      ) AS fragment
      FROM lore_fragment lf
      WHERE lf.entity_id = e.id
      ORDER BY lf.created_at DESC
      LIMIT $6
    ) recent
  ), '[]'::jsonb) AS lore
FROM scored s
JOIN entity e ON e.id = s.id
JOIN world_prominence wp ON wp.id = e.prominence
WHERE wp.rank >= $5
ORDER BY score DESC, e.created_at ASC
LIMIT $7`;

const PROMINENCE_RANK: Record<HardStateProminence, number> = {
  forgotten: 0,
  marginal: 1,
  mythic: 4,
  recognized: 2,
  renowned: 3,
};

/**
 * Assembles what the GM should know about the world right now.
 * One query, one round trip.
 */
export class ContextSliceReader {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async getContextSlice(input: ContextSliceInput): Promise<ContextSliceEntity[]> {
    const focusIds = [
      ...new Set([...(input.anchorId === undefined ? [] : [input.anchorId]), ...input.focusIds]),
    ];
    if (focusIds.length === 0) {
      return [];
    }

    const result = await this.#pool.query<SliceRow>(CONTEXT_SLICE_QUERY, [
      input.anchorId ?? null,
      focusIds,
      input.maxHops,
      normalizeTags(input.focusTags, 16),
      PROMINENCE_RANK[input.minProminence],
      input.loreLimit,
      input.limit,
    ]);

    return result.rows.map((row) => ({
      description: row.description ?? undefined,
      facts: row.props?.facts ?? {},
      hops: row.hops,
      id: row.id,
      kind: row.kind,
      lore: (row.lore ?? []).map((fragment) => ({
        slug: fragment.slug,
        summary: fragment.summary,
        tags: fragment.tags,
        title: fragment.title,
      })),
      name: row.name,
      prominence: row.prominence,
      reach: row.reach,
      score: row.score,
      slug: row.slug,
      status: row.status ?? undefined,
      subkind: row.subkind ?? undefined,
      tags: row.tags ?? [],
    }));
  }
}
