import {
  CanonProposal,
  ContextTagDefinition,
  EncyclopediaEntry,
  type CommitBatchResult,
  type ContextTerm,
} from '@glass-frontier/dto';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

import { CanonWriter } from './canonWriter';
import { withTransaction } from './pg';
import type { TsonuCanonSnapshot } from './tsonuBundle';

export type CanonSnapshotResult = Omit<CommitBatchResult, 'entityIdsByRef'> & {
  classificationCount: number;
  encyclopediaCount: number;
  sourceId: string;
};

type StoredEncyclopediaIdentity = {
  external_key: string;
  id: string;
};

const ENCYCLOPEDIA_UPSERT_SQL = `INSERT INTO encyclopedia_entry
  (id, external_key, slug, title, aliases, kind, subkind, status, dm, summary,
   topics, availability, prevalence, character_role, origin_blurb, facts,
   descriptive_identity, tiers, usage, sections, batch_id, source_revision,
   created_at, updated_at)
 SELECT id, external_key, slug, title, aliases, kind, subkind, status, dm, summary,
   topics, availability, prevalence, character_role, origin_blurb, facts,
   descriptive_identity, tiers, usage, sections, $2::uuid, $3, now(), now()
 FROM jsonb_to_recordset($1::jsonb) AS incoming(
   id uuid, external_key text, slug text, title text, aliases text[], kind text,
   subkind text, status text, dm boolean, summary text, topics text[],
   availability jsonb, prevalence text, character_role text, origin_blurb text,
   facts jsonb, descriptive_identity jsonb, tiers jsonb, usage jsonb, sections jsonb)
 ON CONFLICT (external_key) DO UPDATE SET
   slug = EXCLUDED.slug,
   title = EXCLUDED.title,
   aliases = EXCLUDED.aliases,
   kind = EXCLUDED.kind,
   subkind = EXCLUDED.subkind,
   status = EXCLUDED.status,
   dm = EXCLUDED.dm,
   summary = EXCLUDED.summary,
   topics = EXCLUDED.topics,
   availability = EXCLUDED.availability,
   prevalence = EXCLUDED.prevalence,
   character_role = EXCLUDED.character_role,
   origin_blurb = EXCLUDED.origin_blurb,
   facts = EXCLUDED.facts,
   descriptive_identity = EXCLUDED.descriptive_identity,
   tiers = EXCLUDED.tiers,
   usage = EXCLUDED.usage,
   sections = EXCLUDED.sections,
   batch_id = EXCLUDED.batch_id,
   source_revision = EXCLUDED.source_revision,
   embedding = CASE WHEN
     (encyclopedia_entry.title, encyclopedia_entry.aliases, encyclopedia_entry.kind,
      encyclopedia_entry.subkind, encyclopedia_entry.summary, encyclopedia_entry.topics,
      encyclopedia_entry.facts, encyclopedia_entry.descriptive_identity,
      encyclopedia_entry.usage, encyclopedia_entry.sections)
     IS DISTINCT FROM
     (EXCLUDED.title, EXCLUDED.aliases, EXCLUDED.kind, EXCLUDED.subkind,
      EXCLUDED.summary, EXCLUDED.topics, EXCLUDED.facts,
      EXCLUDED.descriptive_identity, EXCLUDED.usage, EXCLUDED.sections)
     THEN NULL ELSE encyclopedia_entry.embedding END,
   embedding_model = CASE WHEN
     (encyclopedia_entry.title, encyclopedia_entry.aliases, encyclopedia_entry.kind,
      encyclopedia_entry.subkind, encyclopedia_entry.summary, encyclopedia_entry.topics,
      encyclopedia_entry.facts, encyclopedia_entry.descriptive_identity,
      encyclopedia_entry.usage, encyclopedia_entry.sections)
     IS DISTINCT FROM
     (EXCLUDED.title, EXCLUDED.aliases, EXCLUDED.kind, EXCLUDED.subkind,
      EXCLUDED.summary, EXCLUDED.topics, EXCLUDED.facts,
      EXCLUDED.descriptive_identity, EXCLUDED.usage, EXCLUDED.sections)
     THEN NULL ELSE encyclopedia_entry.embedding_model END,
   embedding_updated_at = CASE WHEN
     (encyclopedia_entry.title, encyclopedia_entry.aliases, encyclopedia_entry.kind,
      encyclopedia_entry.subkind, encyclopedia_entry.summary, encyclopedia_entry.topics,
      encyclopedia_entry.facts, encyclopedia_entry.descriptive_identity,
      encyclopedia_entry.usage, encyclopedia_entry.sections)
     IS DISTINCT FROM
     (EXCLUDED.title, EXCLUDED.aliases, EXCLUDED.kind, EXCLUDED.subkind,
      EXCLUDED.summary, EXCLUDED.topics, EXCLUDED.facts,
      EXCLUDED.descriptive_identity, EXCLUDED.usage, EXCLUDED.sections)
     THEN NULL ELSE encyclopedia_entry.embedding_updated_at END,
   updated_at = now()`;

type SnapshotIndex = {
  entries: Map<string, EncyclopediaEntry>;
  tags: Map<string, ContextTagDefinition>;
};

const validateContextTerm = (
  entry: EncyclopediaEntry,
  term: ContextTerm,
  index: SnapshotIndex
): void => {
  if (term.type === 'encyclopedia') {
    if (!index.entries.has(term.encyclopediaExternalKey)) {
      throw new Error(
        `${entry.externalKey} selects unknown Encyclopedia entry ${term.encyclopediaExternalKey}`
      );
    }
    return;
  }
  const tag = index.tags.get(term.tag);
  if (tag === undefined) {
    throw new Error(`${entry.externalKey} selects unknown context tag ${term.tag}`);
  }
  if (!tag.scopes.includes(term.scope)) {
    throw new Error(`${entry.externalKey} uses ${term.tag} outside its ${term.scope} scope`);
  }
};

const validatePublicFields = (entry: EncyclopediaEntry): void => {
  if (
    entry.status !== 'shell'
    && (entry.summary === undefined
      || entry.prevalence === undefined
      || entry.availability === undefined)
  ) {
    throw new Error(`${entry.externalKey} is ${entry.status} but lacks public entry fields`);
  }
};

const validateCharacterRole = (entry: EncyclopediaEntry): void => {
  if (
    entry.characterRole !== undefined
    && (entry.status !== 'complete' || entry.dm || entry.originBlurb === undefined)
  ) {
    throw new Error(`${entry.externalKey} is not a complete player-safe character option`);
  }
};

const validateAvailability = (entry: EncyclopediaEntry, index: SnapshotIndex): void => {
  if (entry.availability?.mode !== 'contextual') {
    return;
  }
  for (const selector of entry.availability.selectors) {
    const terms = [...selector.all, ...selector.any, ...selector.none];
    for (const term of terms) {
      validateContextTerm(entry, term, index);
    }
  }
};

const validateEntry = (entry: EncyclopediaEntry, index: SnapshotIndex): void => {
  validatePublicFields(entry);
  validateCharacterRole(entry);
  validateAvailability(entry, index);
};

const validateSnapshot = (snapshot: TsonuCanonSnapshot): void => {
  const atlas = CanonProposal.parse(snapshot.atlas);
  if (atlas.source !== 'import' || atlas.sourceId !== snapshot.sourceId) {
    throw new Error('The Atlas proposal and Tsonu snapshot must share one import source id');
  }
  const tags = snapshot.contextTags.map((tag) => ContextTagDefinition.parse(tag));
  const entries = snapshot.encyclopedia.map((entry) => EncyclopediaEntry.parse(entry));
  const index: SnapshotIndex = {
    entries: new Map(entries.map((entry) => [entry.externalKey, entry])),
    tags: new Map(tags.map((tag) => [tag.id, tag])),
  };
  if (index.tags.size !== tags.length) {
    throw new Error('The Tsonu snapshot contains duplicate context-tag ids');
  }
  if (
    index.entries.size !== entries.length
    || new Set(entries.map((entry) => entry.slug)).size !== entries.length
  ) {
    throw new Error('The Tsonu snapshot contains duplicate Encyclopedia identity');
  }
  for (const entry of entries) {
    validateEntry(entry, index);
  }
};

const upsertContextTags = async (
  client: PoolClient,
  snapshot: TsonuCanonSnapshot,
  batchId: string
): Promise<void> => {
  await client.query(
    `INSERT INTO reference_context_tag
       (id, description, scopes, parent, compatible_with, batch_id, source_revision, updated_at)
     SELECT id, description, scopes, parent, compatible_with, $2::uuid, $3, now()
     FROM jsonb_to_recordset($1::jsonb)
       AS incoming(id text, description text, scopes text[], parent text, compatible_with text[])
     ON CONFLICT (id) DO UPDATE SET
       description = EXCLUDED.description,
       scopes = EXCLUDED.scopes,
       parent = EXCLUDED.parent,
       compatible_with = EXCLUDED.compatible_with,
       batch_id = EXCLUDED.batch_id,
       source_revision = EXCLUDED.source_revision,
       updated_at = now()`,
    [
      JSON.stringify(
        snapshot.contextTags.map((tag) => ({
          compatible_with: tag.compatibleWith,
          description: tag.description,
          id: tag.id,
          parent: tag.parent ?? null,
          scopes: tag.scopes,
        }))
      ),
      batchId,
      snapshot.revision,
    ]
  );
  await client.query(
    'DELETE FROM reference_context_tag WHERE NOT (id = ANY($1::text[]))',
    [snapshot.contextTags.map((tag) => tag.id)]
  );
};

const encyclopediaIdentities = async (
  client: PoolClient,
  entries: EncyclopediaEntry[]
): Promise<Map<string, string>> => {
  const existing = await client.query<StoredEncyclopediaIdentity>(
    `SELECT id, external_key FROM encyclopedia_entry
     WHERE external_key = ANY($1::text[])`,
    [entries.map((entry) => entry.externalKey)]
  );
  return new Map(existing.rows.map((row) => [row.external_key, row.id]));
};

const encyclopediaRow = (entry: EncyclopediaEntry, id: string): Record<string, unknown> => ({
  aliases: entry.aliases,
  availability: entry.availability ?? null,
  character_role: entry.characterRole ?? null,
  descriptive_identity: entry.descriptiveIdentity,
  dm: entry.dm,
  external_key: entry.externalKey,
  facts: entry.facts,
  id,
  kind: entry.kind,
  origin_blurb: entry.originBlurb ?? null,
  prevalence: entry.prevalence ?? null,
  sections: entry.sections,
  slug: entry.slug,
  status: entry.status,
  subkind: entry.subkind,
  summary: entry.summary ?? null,
  tiers: entry.tiers,
  title: entry.title,
  topics: entry.topics,
  usage: entry.usage,
});

const upsertEncyclopedia = async (
  client: PoolClient,
  snapshot: TsonuCanonSnapshot,
  batchId: string
): Promise<void> => {
  const ids = await encyclopediaIdentities(client, snapshot.encyclopedia);
  const rows = snapshot.encyclopedia.map((entry) =>
    encyclopediaRow(entry, ids.get(entry.externalKey) ?? randomUUID())
  );
  await client.query(
    ENCYCLOPEDIA_UPSERT_SQL,
    [JSON.stringify(rows), batchId, snapshot.revision]
  );
};

const replaceClassifications = async (
  client: PoolClient,
  snapshot: TsonuCanonSnapshot,
  batchId: string
): Promise<void> => {
  await client.query('DELETE FROM atlas_encyclopedia_classification');
  if (snapshot.classifications.length === 0) {
    return;
  }
  await client.query(
    `INSERT INTO atlas_encyclopedia_classification
       (entity_id, encyclopedia_entry_id, role, batch_id, source_revision)
     SELECT entity.id, entry.id, incoming.role, $2::uuid, $3
     FROM jsonb_to_recordset($1::jsonb) AS incoming(
       entity_external_key text, encyclopedia_external_key text, role text)
     JOIN entity ON entity.source = 'import'
       AND entity.external_key = incoming.entity_external_key
     JOIN encyclopedia_entry entry
       ON entry.external_key = incoming.encyclopedia_external_key`,
    [
      JSON.stringify(
        snapshot.classifications.map((classification) => ({
          encyclopedia_external_key: classification.encyclopediaExternalKey,
          entity_external_key: classification.entityExternalKey,
          role: classification.role,
        }))
      ),
      batchId,
      snapshot.revision,
    ]
  );
  const count = await client.query<{ count: string }>(
    'SELECT count(*)::text AS count FROM atlas_encyclopedia_classification'
  );
  if (Number(count.rows[0]?.count ?? 0) !== snapshot.classifications.length) {
    throw new Error('Not every Atlas Encyclopedia classification resolved during import');
  }
};

const removeStaleEncyclopedia = async (
  client: PoolClient,
  entries: EncyclopediaEntry[]
): Promise<void> => {
  await client.query(
    'DELETE FROM encyclopedia_entry WHERE NOT (external_key = ANY($1::text[]))',
    [entries.map((entry) => entry.externalKey)]
  );
};

export class CanonSnapshotWriter {
  readonly #canon: CanonWriter;
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#canon = new CanonWriter(pool);
    this.#pool = pool;
  }

  async commit(snapshot: TsonuCanonSnapshot): Promise<CanonSnapshotResult> {
    validateSnapshot(snapshot);
    return withTransaction(this.#pool, async (client) => {
      const atlas = await this.#canon.commitBatchWithClient(client, snapshot.atlas);
      await upsertContextTags(client, snapshot, atlas.batchId);
      await upsertEncyclopedia(client, snapshot, atlas.batchId);
      await replaceClassifications(client, snapshot, atlas.batchId);
      await removeStaleEncyclopedia(client, snapshot.encyclopedia);
      await client.query(
        `UPDATE ingest_batch
         SET encyclopedia_count = $2, classification_count = $3
         WHERE id = $1::uuid`,
        [atlas.batchId, snapshot.encyclopedia.length, snapshot.classifications.length]
      );
      return {
        batchId: atlas.batchId,
        classificationCount: snapshot.classifications.length,
        encyclopediaCount: snapshot.encyclopedia.length,
        entityCount: atlas.entityCount,
        loreCount: atlas.loreCount,
        relationshipCount: atlas.relationshipCount,
        sourceId: snapshot.sourceId,
      };
    });
  }
}
