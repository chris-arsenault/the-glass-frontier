import {
  EncyclopediaEntry,
  EncyclopediaEntrySummary,
  PlayerEncyclopediaEntry,
  type ContextTerm,
  type EncyclopediaAvailability,
  type EncyclopediaCharacterRole,
  type EncyclopediaClassification,
  type EncyclopediaPrevalence,
  type EncyclopediaSection,
  type EncyclopediaUsage,
} from '@glass-frontier/dto';
import type { Pool } from 'pg';

import { createPool } from './pg';
import type {
  EncyclopediaEmbeddingSource,
  EncyclopediaSearchCandidate,
  EncyclopediaStore,
  StoredEncyclopediaEntry,
} from './types';

const EMBEDDING_DIMENSIONS = 1024;
const EMBEDDING_MODEL = 'cohere.embed-v4:0';

type EncyclopediaRow = {
  aliases: string[];
  availability: EncyclopediaAvailability | null;
  character_role: EncyclopediaCharacterRole | null;
  descriptive_identity: Record<string, string>;
  dm: boolean;
  external_key: string;
  facts: Record<string, string | number>;
  id: string;
  kind: string;
  origin_blurb: string | null;
  prevalence: EncyclopediaPrevalence | null;
  sections: EncyclopediaSection[];
  slug: string;
  status: 'shell' | 'draft' | 'complete';
  subkind: string;
  summary: string | null;
  tiers: Array<{ tier: string; effect: string; cost?: string }>;
  title: string;
  topics: string[];
  usage: EncyclopediaUsage;
};

type ListEntriesInput = {
  includeDm?: boolean;
  kind?: string;
  limit?: number;
  prevalence?: EncyclopediaPrevalence;
  query?: string;
  status?: 'draft' | 'complete';
  subkind?: string;
  topic?: string;
};

const ENTRY_COLUMNS = `id, external_key, slug, title, aliases, kind, subkind,
  status, dm, summary, topics, availability, prevalence, character_role,
  origin_blurb, facts, descriptive_identity, tiers, usage, sections`;
const ENTRY_SELECT = `SELECT ${ENTRY_COLUMNS} FROM encyclopedia_entry`;

const bareSlug = (slug: string): string => slug.replace(/^encyclopedia:/, '');
const qualifiedEncyclopediaSlug = (slug: string): string => `encyclopedia:${slug}`;
const qualifiedAtlasSlug = (slug: string): string => `atlas:${slug}`;

const toEntry = (row: EncyclopediaRow): StoredEncyclopediaEntry => ({
  id: row.id,
  ...EncyclopediaEntry.parse({
    aliases: row.aliases,
    availability: row.availability ?? undefined,
    characterRole: row.character_role ?? undefined,
    descriptiveIdentity: row.descriptive_identity,
    dm: row.dm,
    externalKey: row.external_key,
    facts: row.facts,
    instances: [],
    kind: row.kind,
    members: [],
    originBlurb: row.origin_blurb ?? undefined,
    prevalence: row.prevalence ?? undefined,
    sections: row.sections,
    slug: row.slug,
    status: row.status,
    subkind: row.subkind,
    summary: row.summary ?? undefined,
    tiers: row.tiers,
    title: row.title,
    topics: row.topics,
    usage: row.usage,
  }),
});

export const encyclopediaSummary = (
  entry: StoredEncyclopediaEntry
): EncyclopediaEntrySummary => {
  if (
    entry.status === 'shell'
    || entry.summary === undefined
    || entry.prevalence === undefined
  ) {
    throw new Error(`Shell Encyclopedia entry ${entry.externalKey} has no public summary`);
  }
  return EncyclopediaEntrySummary.parse({
    kind: entry.kind,
    prevalence: entry.prevalence,
    slug: qualifiedEncyclopediaSlug(entry.slug),
    status: entry.status,
    subkind: entry.subkind,
    summary: entry.summary,
    title: entry.title,
    topics: entry.topics,
  });
};

export const playerEncyclopediaEntry = (entry: StoredEncyclopediaEntry): PlayerEncyclopediaEntry =>
  PlayerEncyclopediaEntry.parse({
    ...entry,
    sections: entry.sections.filter((section) => section.audience === 'player'),
  });

const termMatches = (candidate: ContextTerm, context: ContextTerm[]): boolean =>
  context.some((term) => {
    if (term.type !== candidate.type || term.scope !== candidate.scope) {
      return false;
    }
    return term.type === 'tag' && candidate.type === 'tag'
      ? term.tag === candidate.tag
      : term.type === 'encyclopedia' && candidate.type === 'encyclopedia'
        ? term.encyclopediaExternalKey === candidate.encyclopediaExternalKey
        : false;
  });

const availabilityMatches = (
  availability: EncyclopediaAvailability | undefined,
  context: ContextTerm[]
): boolean => {
  if (availability === undefined) {
    return false;
  }
  if (availability.mode === 'global') {
    return true;
  }
  return availability.selectors.some(
    (selector) =>
      selector.all.every((term) => termMatches(term, context))
      && (selector.any.length === 0 || selector.any.some((term) => termMatches(term, context)))
      && selector.none.every((term) => !termMatches(term, context))
  );
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildListQuery = (input: ListEntriesInput): { params: unknown[]; where: string } => {
  const params: unknown[] = [];
  const clauses = ['status <> \'shell\''];
  if (!(input.includeDm ?? false)) {
    clauses.push('NOT dm');
  }
  const filters: Array<[unknown, string]> = [
    [input.kind, 'kind = ?'],
    [input.subkind, 'subkind = ?'],
    [input.prevalence, 'prevalence = ?'],
    [input.status, 'status = ?'],
    [input.topic, '? = ANY(topics)'],
  ];
  for (const [value, clause] of filters) {
    if (value !== undefined) {
      params.push(value);
      clauses.push(clause.replace('?', `$${params.length}`));
    }
  }
  const query = input.query?.trim();
  if (query !== undefined && query.length > 0) {
    params.push(query);
    const index = params.length;
    clauses.push(`(
      search @@ websearch_to_tsquery('english', $${index})
      OR lower(title) LIKE '%' || lower($${index}) || '%'
      OR EXISTS (
        SELECT 1 FROM unnest(aliases) alias
        WHERE lower(alias) LIKE '%' || lower($${index}) || '%'
      )
    )`);
  }
  return { params, where: clauses.join(' AND ') };
};

const toAtlasRecord = (classification: EncyclopediaClassification): {
  kind: string;
  slug: string;
  subkind: string;
  title: string;
} => ({
  kind: 'atlas',
  slug: classification.atlasSlug,
  subkind: classification.role,
  title: classification.atlasTitle,
});

class PostgresEncyclopediaStore implements EncyclopediaStore {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async getEntry(input: {
    slug: string;
    includeDm?: boolean;
    includeShell?: boolean;
  }): Promise<StoredEncyclopediaEntry | null> {
    const result = await this.#pool.query<EncyclopediaRow>(
      `${ENTRY_SELECT}
       WHERE slug = $1
         AND ($2::boolean OR NOT dm)
         AND ($3::boolean OR status <> 'shell')`,
      [bareSlug(input.slug), input.includeDm ?? false, input.includeShell ?? false]
    );
    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }
    return this.#withAtlasRecords(toEntry(row));
  }

  async getEntryById(id: string): Promise<StoredEncyclopediaEntry | null> {
    const result = await this.#pool.query<EncyclopediaRow>(
      `${ENTRY_SELECT} WHERE id = $1::uuid`,
      [id]
    );
    const row = result.rows[0];
    return row === undefined ? null : toEntry(row);
  }

  async listEntries(input: ListEntriesInput = {}): Promise<StoredEncyclopediaEntry[]> {
    const { params, where } = buildListQuery(input);
    params.push(Math.max(1, Math.min(input.limit ?? 200, 500)));
    const result = await this.#pool.query<EncyclopediaRow>(
      `${ENTRY_SELECT}
       WHERE ${where}
       ORDER BY kind, CASE prevalence WHEN 'common' THEN 0 WHEN 'uncommon' THEN 1 ELSE 2 END,
         title
       LIMIT $${params.length}`,
      params
    );
    return result.rows.map(toEntry);
  }

  async listApplicable(input: { terms: ContextTerm[] }): Promise<StoredEncyclopediaEntry[]> {
    const entries = await this.listEntries({ limit: 500, status: 'complete' });
    return entries.filter((entry) => availabilityMatches(entry.availability, input.terms));
  }

  async listCharacterOptions(
    role: EncyclopediaCharacterRole
  ): Promise<StoredEncyclopediaEntry[]> {
    const result = await this.#pool.query<EncyclopediaRow>(
      `${ENTRY_SELECT}
       WHERE status = 'complete' AND NOT dm AND character_role = $1
       ORDER BY title`,
      [role]
    );
    return result.rows.map(toEntry);
  }

  async listClassificationsForEntity(entityId: string): Promise<EncyclopediaClassification[]> {
    const result = await this.#pool.query<{
      atlas_slug: string;
      atlas_title: string;
      encyclopedia_kind: string;
      encyclopedia_slug: string;
      encyclopedia_title: string;
      role: 'type' | 'membership';
    }>(
      `SELECT entity.slug AS atlas_slug, entity.name AS atlas_title,
         entry.kind AS encyclopedia_kind, entry.slug AS encyclopedia_slug,
         entry.title AS encyclopedia_title, classification.role
       FROM atlas_encyclopedia_classification classification
       JOIN entity ON entity.id = classification.entity_id
       JOIN encyclopedia_entry entry ON entry.id = classification.encyclopedia_entry_id
       WHERE classification.entity_id = $1::uuid AND entry.status <> 'shell' AND NOT entry.dm
       ORDER BY classification.role DESC, entry.kind, entry.title`,
      [entityId]
    );
    return result.rows.map((row) => ({
      atlasSlug: qualifiedAtlasSlug(row.atlas_slug),
      atlasTitle: row.atlas_title,
      encyclopediaKind: row.encyclopedia_kind,
      encyclopediaSlug: qualifiedEncyclopediaSlug(row.encyclopedia_slug),
      encyclopediaTitle: row.encyclopedia_title,
      role: row.role,
    }));
  }

  async listAtlasExamplesForEntry(slug: string): Promise<EncyclopediaClassification[]> {
    const result = await this.#pool.query<{
      atlas_slug: string;
      atlas_title: string;
      encyclopedia_kind: string;
      encyclopedia_slug: string;
      encyclopedia_title: string;
      role: 'type' | 'membership';
    }>(
      `SELECT entity.slug AS atlas_slug, entity.name AS atlas_title,
         entry.kind AS encyclopedia_kind, entry.slug AS encyclopedia_slug,
         entry.title AS encyclopedia_title, classification.role
       FROM atlas_encyclopedia_classification classification
       JOIN entity ON entity.id = classification.entity_id
       JOIN encyclopedia_entry entry ON entry.id = classification.encyclopedia_entry_id
       WHERE entry.slug = $1 AND NOT entity.dm
       ORDER BY classification.role DESC, entity.name`,
      [bareSlug(slug)]
    );
    return result.rows.map((row) => ({
      atlasSlug: qualifiedAtlasSlug(row.atlas_slug),
      atlasTitle: row.atlas_title,
      encyclopediaKind: row.encyclopedia_kind,
      encyclopediaSlug: qualifiedEncyclopediaSlug(row.encyclopedia_slug),
      encyclopediaTitle: row.encyclopedia_title,
      role: row.role,
    }));
  }

  async findMentionedEntries(text: string): Promise<StoredEncyclopediaEntry[]> {
    if (text.trim().length === 0) {
      return [];
    }
    const entries = await this.listEntries({ limit: 500, status: 'complete' });
    return entries
      .filter((entry) =>
        [entry.title, ...entry.aliases].some((name) =>
          new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(name)}(?=$|[^\\p{L}\\p{N}])`, 'iu')
            .test(text)
        )
      )
      .sort((a, b) => {
        const lengthOrder = b.title.length - a.title.length;
        return lengthOrder !== 0 ? lengthOrder : a.title.localeCompare(b.title);
      });
  }

  async listMissingEmbeddings(limit = 100): Promise<EncyclopediaEmbeddingSource[]> {
    const result = await this.#pool.query<EncyclopediaEmbeddingSource>(
      `SELECT id,
         concat_ws(E'\n', title, 'kind: ' || kind, 'subkind: ' || subkind, summary,
           descriptive_identity::text, facts::text, usage::text) AS text
       FROM encyclopedia_entry
       WHERE embedding IS NULL AND status <> 'shell'
       ORDER BY created_at, id
       LIMIT $1`,
      [Math.max(1, Math.min(limit, 500))]
    );
    return result.rows;
  }

  async saveEmbedding(id: string, embedding: number[]): Promise<void> {
    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Encyclopedia entry ${id} embedding is ${embedding.length} wide; the column holds `
        + `${EMBEDDING_DIMENSIONS}.`
      );
    }
    await this.#pool.query(
      `UPDATE encyclopedia_entry
       SET embedding = $2::vector, embedding_model = $3, embedding_updated_at = now()
       WHERE id = $1::uuid`,
      [id, `[${embedding.join(',')}]`, EMBEDDING_MODEL]
    );
  }

  async findCandidates(input: {
    embedding: number[];
    includeDrafts?: boolean;
    limit?: number;
  }): Promise<EncyclopediaSearchCandidate[]> {
    const result = await this.#pool.query<EncyclopediaRow & { similarity: number }>(
      `SELECT ${ENTRY_COLUMNS}, (1 - (embedding <=> $1::vector))::real AS similarity
       FROM encyclopedia_entry
       WHERE embedding IS NOT NULL AND NOT dm
         AND status = ANY($2::text[])
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
      [
        `[${input.embedding.join(',')}]`,
        input.includeDrafts === false ? ['complete'] : ['complete', 'draft'],
        Math.max(1, Math.min(input.limit ?? 8, 20)),
      ]
    );
    return result.rows.map((row) => ({
      ...encyclopediaSummary(toEntry(row)),
      similarity: row.similarity,
    }));
  }

  async #withAtlasRecords(entry: StoredEncyclopediaEntry): Promise<StoredEncyclopediaEntry> {
    const classifications = await this.listAtlasExamplesForEntry(entry.slug);
    return {
      ...entry,
      instances: classifications.filter((item) => item.role === 'type').map(toAtlasRecord),
      members: classifications.filter((item) => item.role === 'membership').map(toAtlasRecord),
    };
  }
}

export const createEncyclopediaStore = (options?: {
  pool?: Pool;
  connectionString?: string;
}): EncyclopediaStore => {
  const pool = options?.pool ?? createPool({ connectionString: options?.connectionString });
  return new PostgresEncyclopediaStore(pool);
};
