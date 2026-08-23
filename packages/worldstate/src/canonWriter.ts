import {
  getWorldKind,
  relationshipDefaultStrength,
  type CanonProposal,
  type CanonSource,
  type CommitBatchResult,
  type EntityRef,
  type ProposedEntity,
  type ProposedLoreFragment,
} from '@glass-frontier/dto';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

import { entityPropsJson, relationshipPropsJson } from './canonProps';
import {
  ProposalRejected,
  refKey,
  validateProposal,
  type ResolvableEntity,
} from './canonValidation';
import {
  CANON_WRITE_LOCK_SQL,
  ENTITY_UPSERT_SQL,
  RELATIONSHIP_UPSERT_SQL,
} from './canonWriterSql';
import { withTransaction } from './pg';
import { normalizeTags, toSnakeCase } from './utils';

type EntityWrite = {
  id: string;
  slug: string;
  proposed: ProposedEntity;
};

type LoreWrite = {
  id: string;
  slug: string;
  entityId: string;
  proposed: ProposedLoreFragment;
};

/**
 * The only writer of canon.
 *
 * A proposal is validated whole against the vocabulary before anything is
 * written, then committed in one transaction under a batch id. Reverting that
 * batch is the correction path — nothing edits canon a row at a time.
 */
export class CanonWriter {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async commitBatch(proposal: CanonProposal): Promise<CommitBatchResult> {
    return withTransaction(this.#pool, async (client) => {
      await client.query(CANON_WRITE_LOCK_SQL);
      const existing = await loadReferencedEntities(client, proposal);
      const { violations } = validateProposal(proposal, existing);
      if (violations.length > 0) {
        throw new ProposalRejected(violations);
      }

      const batchId = randomUUID();
      await insertBatchRecord(client, batchId, proposal);

      const writes = await planEntityWrites(client, proposal, existing);
      await insertEntities(client, writes, batchId, proposal);

      const resolved = resolveIds(writes, existing);
      await insertRelationships(client, proposal, batchId, resolved);

      const loreWrites = await planLoreWrites(client, proposal, resolved);
      await insertLore(client, loreWrites, batchId, proposal);

      const entityIdsByRef: Record<string, string> = {};
      for (const write of writes) {
        if (write.proposed.ref !== undefined) {
          entityIdsByRef[write.proposed.ref] = write.id;
        }
      }

      return {
        batchId,
        entityCount: proposal.entities.length,
        entityIdsByRef,
        loreCount: proposal.lore.length,
        relationshipCount: proposal.relationships.length,
      };
    });
  }

  /**
   * The most recent batch committed for a source and sourceId, if any. This is
   * how a writer that runs once per unit of work (a canon seed revision, a
   * chronicle closure) discovers it has already run.
   */
  async findBatch(input: {
    source: CanonSource;
    sourceId: string;
  }): Promise<{ batchId: string } | null> {
    const result = await this.#pool.query<{ id: string }>(
      `SELECT id FROM ingest_batch
       WHERE source = $1 AND source_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [input.source, input.sourceId]
    );
    const row = result.rows[0];
    return row === undefined ? null : { batchId: row.id };
  }

  /**
   * Removes everything a batch wrote. Entities and lore cascade from their
   * nodes; edges are deleted directly because they are not nodes.
   */
  async revertBatch(batchId: string): Promise<void> {
    await withTransaction(this.#pool, async (client) => {
      await client.query('DELETE FROM edge WHERE batch_id = $1::uuid', [batchId]);
      await client.query(
        `DELETE FROM node WHERE id IN (
           SELECT id FROM lore_fragment WHERE batch_id = $1::uuid
           UNION ALL
           SELECT id FROM entity WHERE batch_id = $1::uuid
         )`,
        [batchId]
      );
      await client.query('DELETE FROM ingest_batch WHERE id = $1::uuid', [batchId]);
    });
  }
}

/**
 * Resolves the entities a proposal points at but does not declare, so
 * relationship rules can be checked against their kinds.
 */
const loadReferencedEntities = async (
  client: PoolClient,
  proposal: CanonProposal
): Promise<Map<string, ResolvableEntity>> => {
  const ids: string[] = [];
  const externalKeys: string[] = [];
  const collect = (ref: EntityRef): void => {
    if ('id' in ref) {
      ids.push(ref.id);
    } else if ('externalKey' in ref) {
      externalKeys.push(ref.externalKey);
    }
  };
  for (const relationship of proposal.relationships) {
    collect(relationship.src);
    collect(relationship.dst);
  }
  for (const fragment of proposal.lore) {
    collect(fragment.entity);
  }
  for (const entity of proposal.entities) {
    if (entity.externalKey !== undefined) {
      externalKeys.push(entity.externalKey);
    }
  }

  const resolved = new Map<string, ResolvableEntity>();
  if (ids.length === 0 && externalKeys.length === 0) {
    return resolved;
  }
  const result = await client.query<{ id: string; kind: string; external_key: string | null }>(
    `SELECT id, kind, external_key FROM entity
     WHERE id = ANY($1::uuid[])
        OR (source = $3 AND external_key = ANY($2::text[]))`,
    [ids, externalKeys, proposal.source]
  );
  for (const row of result.rows) {
    resolved.set(`id:${row.id}`, { id: row.id, kind: row.kind });
    if (row.external_key !== null) {
      resolved.set(`key:${row.external_key}`, { id: row.id, kind: row.kind });
    }
  }
  return resolved;
};

const insertBatchRecord = async (
  client: PoolClient,
  batchId: string,
  proposal: CanonProposal
): Promise<void> => {
  await client.query(
    `INSERT INTO ingest_batch
     (id, source, source_id, entity_count, relationship_count, lore_count)
     VALUES ($1::uuid, $2, $3, $4, $5, $6)`,
    [
      batchId,
      proposal.source,
      proposal.sourceId ?? null,
      proposal.entities.length,
      proposal.relationships.length,
      proposal.lore.length,
    ]
  );
};

const planEntityWrites = async (
  client: PoolClient,
  proposal: CanonProposal,
  existing: Map<string, ResolvableEntity>
): Promise<EntityWrite[]> => {
  const idFor = (entity: ProposedEntity): string => {
    const priorId =
      entity.externalKey === undefined ? undefined : existing.get(`key:${entity.externalKey}`)?.id;
    return entity.id ?? priorId ?? randomUUID();
  };
  const pending = proposal.entities.map((proposed) => ({
    base: slugBase(proposed.name, 'entity'),
    id: idFor(proposed),
    proposed,
  }));
  const taken = await takenSlugs(
    client,
    'entity',
    pending.map((entry) => entry.base),
    pending.map((entry) => entry.id)
  );
  return pending.map((entry) => ({
    id: entry.id,
    proposed: entry.proposed,
    slug: claimSlug(entry.base, taken),
  }));
};

const insertEntities = async (
  client: PoolClient,
  writes: EntityWrite[],
  batchId: string,
  proposal: CanonProposal
): Promise<void> => {
  if (writes.length === 0) {
    return;
  }
  const nodeIds = writes.map((write) => write.id);
  await insertNodeIdentities(client, nodeIds, 'entity');
  await client.query(ENTITY_UPSERT_SQL, [
    writes.map((write) => write.id),
    writes.map((write) => write.slug),
    writes.map((write) => write.proposed.kind),
    writes.map((write) => write.proposed.subkind ?? null),
    writes.map((write) => write.proposed.name),
    writes.map((write) => write.proposed.description?.trim() ?? null),
    writes.map((write) => write.proposed.prominence ?? 'recognized'),
    writes.map((write) => write.proposed.status ?? null),
    proposal.source,
    proposal.sourceId ?? null,
    batchId,
    writes.map((write) => write.proposed.externalKey ?? null),
    writes.map((write) => entityPropsJson(write.proposed)),
    writes.map(
      (write) => write.proposed.isLocation ?? getWorldKind(write.proposed.kind)?.isLocation ?? false
    ),
    writes.map((write) => write.proposed.isArticle ?? false),
    writes.map((write) => JSON.stringify(write.proposed.playableAs ?? [])),
    writes.map((write) => write.proposed.originBlurb ?? null),
    writes.map((write) => write.proposed.veiled ?? false),
    writes.map((write) => write.proposed.veilTagline ?? null),
    writes.map((write) => write.proposed.dm ?? false),
  ]);
};

const resolveIds = (
  writes: EntityWrite[],
  existing: Map<string, ResolvableEntity>
): Map<string, string> => {
  const resolved = new Map<string, string>();
  for (const [key, entity] of existing) {
    resolved.set(key, entity.id);
  }
  for (const write of writes) {
    resolved.set(`id:${write.id}`, write.id);
    if (write.proposed.ref !== undefined) {
      resolved.set(`ref:${write.proposed.ref}`, write.id);
    }
    if (write.proposed.externalKey !== undefined) {
      resolved.set(`key:${write.proposed.externalKey}`, write.id);
    }
  }
  return resolved;
};

const insertRelationships = async (
  client: PoolClient,
  proposal: CanonProposal,
  batchId: string,
  resolved: Map<string, string>
): Promise<void> => {
  if (proposal.relationships.length === 0) {
    return;
  }
  const rows = proposal.relationships.map((relationship) => {
    const src = resolved.get(refKey(relationship.src));
    const dst = resolved.get(refKey(relationship.dst));
    if (src === undefined || dst === undefined) {
      throw new Error('Relationship endpoint went unresolved after validation');
    }
    return {
      dst,
      props: relationshipPropsJson(relationship),
      src,
      strength: relationship.strength ?? relationshipDefaultStrength(relationship.relationship),
      type: relationship.relationship,
    };
  });

  await client.query(RELATIONSHIP_UPSERT_SQL, [
    rows.map(() => randomUUID()),
    rows.map((row) => row.src),
    rows.map((row) => row.dst),
    rows.map((row) => row.type),
    rows.map((row) => row.strength),
    proposal.source,
    proposal.sourceId ?? null,
    batchId,
    rows.map((row) => row.props),
  ]);
};
type PriorLoreWrite = { id: string; slug: string };
const loadPriorLore = async (
  client: PoolClient,
  proposal: CanonProposal
): Promise<Map<string, PriorLoreWrite>> => {
  const externalKeys = proposal.lore.flatMap((fragment) =>
    fragment.externalKey === undefined ? [] : [fragment.externalKey]
  );
  const priorByExternalKey = new Map<string, PriorLoreWrite>();
  if (externalKeys.length === 0) {
    return priorByExternalKey;
  }
  const prior = await client.query<{ external_key: string; id: string; slug: string }>(
    `SELECT external_key, id, slug FROM lore_fragment
     WHERE source = $1 AND external_key = ANY($2::text[])`,
    [proposal.source, externalKeys]
  );
  for (const row of prior.rows) {
    priorByExternalKey.set(row.external_key, { id: row.id, slug: row.slug });
  }
  return priorByExternalKey;
};
const planLoreWrites = async (
  client: PoolClient,
  proposal: CanonProposal,
  resolved: Map<string, string>
): Promise<LoreWrite[]> => {
  if (proposal.lore.length === 0) {
    return [];
  }
  const priorLore = await loadPriorLore(client, proposal);
  const pending = proposal.lore.map((proposed) => {
    const entityId = resolved.get(refKey(proposed.entity));
    if (entityId === undefined) {
      throw new Error('Lore target went unresolved after validation');
    }
    const prior =
      proposed.externalKey === undefined ? undefined : priorLore.get(proposed.externalKey);
    return {
      base: slugBase(proposed.title, 'frag'),
      entityId,
      id: proposed.id ?? prior?.id ?? randomUUID(),
      priorSlug: prior?.slug,
      proposed,
    };
  });
  const taken = await takenSlugs(
    client,
    'lore_fragment',
    pending.map((entry) => entry.base),
    pending.map((entry) => entry.id)
  );
  for (const entry of pending) {
    if (entry.priorSlug !== undefined) {
      taken.add(entry.priorSlug);
    }
  }
  return pending.map((entry) => ({
    entityId: entry.entityId,
    id: entry.id,
    proposed: entry.proposed,
    slug: entry.priorSlug ?? claimSlug(entry.base, taken),
  }));
};

const insertLore = async (
  client: PoolClient,
  writes: LoreWrite[],
  batchId: string,
  proposal: CanonProposal
): Promise<void> => {
  if (writes.length === 0) {
    return;
  }
  const nodeIds = writes.map((write) => write.id);
  await insertNodeIdentities(client, nodeIds, 'lore_fragment');
  // Rows go over as jsonb because `tags` is an array column, and unnest would
  // flatten an array of arrays into one long list.
  const rows = writes.map((write) => ({
    entity_id: write.entityId,
    external_key: write.proposed.externalKey ?? null,
    id: write.id,
    prose: write.proposed.prose,
    slug: write.slug,
    tags: normalizeTags(write.proposed.tags, 24),
    title: write.proposed.title,
  }));
  await client.query(
    `INSERT INTO lore_fragment
     (id, entity_id, slug, title, prose, tags, source, source_id, external_key,
      batch_id, created_at)
     SELECT r.id, r.entity_id, r.slug, r.title, r.prose,
       ARRAY(SELECT jsonb_array_elements_text(r.tags)),
       $2, $3, r.external_key, $4::uuid, now()
     FROM jsonb_to_recordset($1::jsonb) AS r(
       id uuid, entity_id uuid, slug text, title text, prose text,
       tags jsonb, external_key text
     )
     ON CONFLICT (id) DO UPDATE SET entity_id = EXCLUDED.entity_id,
       slug = EXCLUDED.slug, title = EXCLUDED.title, prose = EXCLUDED.prose,
       tags = EXCLUDED.tags,
       source = EXCLUDED.source, source_id = EXCLUDED.source_id,
       batch_id = EXCLUDED.batch_id
     WHERE lore_fragment.source = EXCLUDED.source
       AND (lore_fragment.entity_id, lore_fragment.slug, lore_fragment.title,
         lore_fragment.prose, lore_fragment.tags)
       IS DISTINCT FROM
         (EXCLUDED.entity_id, EXCLUDED.slug, EXCLUDED.title,
          EXCLUDED.prose, EXCLUDED.tags)`,
    [JSON.stringify(rows), proposal.source, proposal.sourceId ?? null, batchId]
  );
};

const insertNodeIdentities = async (
  client: PoolClient,
  ids: string[],
  kind: 'entity' | 'lore_fragment'
): Promise<void> => {
  await client.query(
    `INSERT INTO node (id, kind, created_at)
     SELECT id, $2, now() FROM unnest($1::uuid[]) AS t(id)
     ON CONFLICT (id) DO UPDATE SET kind = EXCLUDED.kind`,
    [ids, kind]
  );
};

const slugBase = (source: string, fallbackPrefix: string): string => {
  const base = toSnakeCase(source);
  if (base.length === 0) {
    return `${fallbackPrefix}_${randomUUID().slice(0, 8)}`;
  }
  return fallbackPrefix === 'frag' ? `frag_${base}` : base;
};

/**
 * Existing slugs that could collide with any of these bases, so the whole batch
 * can pick its slugs from one query instead of one per row.
 */
const takenSlugs = async (
  client: PoolClient,
  table: 'entity' | 'lore_fragment',
  bases: string[],
  ids: string[]
): Promise<Set<string>> => {
  if (bases.length === 0) {
    return new Set();
  }
  const patterns = bases.map((base) => `${base}%`);
  const query =
    table === 'entity'
      ? 'SELECT slug FROM entity WHERE slug LIKE ANY($1::text[]) AND id <> ALL($2::uuid[])'
      : 'SELECT slug FROM lore_fragment WHERE slug LIKE ANY($1::text[]) AND id <> ALL($2::uuid[])';
  const result = await client.query<{ slug: string }>(query, [patterns, ids]);
  return new Set(result.rows.map((row) => row.slug));
};

/**
 * Slugs stay stable across re-ingest: the same name yields the same slug, and a
 * genuine collision gets a counted suffix rather than a random one.
 */
const claimSlug = (base: string, taken: Set<string>): string => {
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  let suffix = 2;
  while (taken.has(`${base}_${suffix}`)) {
    suffix += 1;
  }
  const claimed = `${base}_${suffix}`;
  taken.add(claimed);
  return claimed;
};
