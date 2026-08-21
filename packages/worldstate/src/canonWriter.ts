import {
  relationshipDefaultStrength,
  type CanonProposal,
  type CommitBatchResult,
  type EntityRef,
  type ProposedEntity,
  type ProposedLoreFragment,
} from '@glass-frontier/dto';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

import {
  ProposalRejected,
  refKey,
  validateProposal,
  type ResolvableEntity,
} from './canonValidation';
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
  await insertNodeIdentities(client, writes.map((write) => write.id), 'entity');
  await client.query(
    `INSERT INTO entity
     (id, slug, kind, subkind, name, description, prominence, status, props,
      source, source_id, external_key, batch_id, created_at, updated_at)
     SELECT id, slug, kind, subkind, name, description, prominence, status, props::jsonb,
       $9, $10, external_key, $11::uuid, now(), now()
     FROM unnest($1::uuid[], $2::text[], $3::text[], $4::text[], $5::text[],
       $6::text[], $7::text[], $8::text[], $12::text[], $13::text[])
       AS t(id, slug, kind, subkind, name, description, prominence, status, external_key, props)
     ON CONFLICT (id) DO UPDATE SET slug = EXCLUDED.slug, kind = EXCLUDED.kind,
       subkind = EXCLUDED.subkind, name = EXCLUDED.name,
       description = EXCLUDED.description, prominence = EXCLUDED.prominence,
       status = EXCLUDED.status, props = EXCLUDED.props, source = EXCLUDED.source,
       source_id = EXCLUDED.source_id, external_key = EXCLUDED.external_key,
       batch_id = EXCLUDED.batch_id, updated_at = now()`,
    [
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
      writes.map((write) => JSON.stringify({ facts: write.proposed.facts ?? {} })),
    ]
  );
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
      props: JSON.stringify({
        ...(relationship.since === undefined ? {} : { since: relationship.since }),
        ...(relationship.until === undefined ? {} : { until: relationship.until }),
      }),
      src,
      strength: relationship.strength ?? relationshipDefaultStrength(relationship.relationship),
      type: relationship.relationship,
    };
  });

  await client.query(
    `INSERT INTO edge (id, src_id, dst_id, type, props, strength, source, source_id, batch_id, created_at)
     SELECT id, src_id, dst_id, type, props::jsonb, strength, $6, $7, $8::uuid, now()
     FROM unnest($1::uuid[], $2::uuid[], $3::uuid[], $4::text[], $5::real[], $9::text[])
       AS t(id, src_id, dst_id, type, strength, props)
     ON CONFLICT (src_id, dst_id, type) DO UPDATE SET strength = EXCLUDED.strength,
       props = EXCLUDED.props, source = EXCLUDED.source, source_id = EXCLUDED.source_id,
       batch_id = EXCLUDED.batch_id`,
    [
      rows.map(() => randomUUID()),
      rows.map((row) => row.src),
      rows.map((row) => row.dst),
      rows.map((row) => row.type),
      rows.map((row) => row.strength),
      proposal.source,
      proposal.sourceId ?? null,
      batchId,
      rows.map((row) => row.props),
    ]
  );
};

const planLoreWrites = async (
  client: PoolClient,
  proposal: CanonProposal,
  resolved: Map<string, string>
): Promise<LoreWrite[]> => {
  if (proposal.lore.length === 0) {
    return [];
  }
  const externalKeys = proposal.lore.flatMap((fragment) =>
    fragment.externalKey === undefined ? [] : [fragment.externalKey]
  );
  const priorIds = new Map<string, string>();
  if (externalKeys.length > 0) {
    const prior = await client.query<{ id: string; external_key: string }>(
      'SELECT id, external_key FROM lore_fragment WHERE source = $1 AND external_key = ANY($2::text[])',
      [proposal.source, externalKeys]
    );
    for (const row of prior.rows) {
      priorIds.set(row.external_key, row.id);
    }
  }

  const pending = proposal.lore.map((proposed) => {
    const entityId = resolved.get(refKey(proposed.entity));
    if (entityId === undefined) {
      throw new Error('Lore target went unresolved after validation');
    }
    const priorId =
      proposed.externalKey === undefined ? undefined : priorIds.get(proposed.externalKey);
    return {
      base: slugBase(proposed.title, 'frag'),
      entityId,
      id: proposed.id ?? priorId ?? randomUUID(),
      proposed,
    };
  });
  const taken = await takenSlugs(
    client,
    'lore_fragment',
    pending.map((entry) => entry.base),
    pending.map((entry) => entry.id)
  );
  return pending.map((entry) => ({
    entityId: entry.entityId,
    id: entry.id,
    proposed: entry.proposed,
    slug: claimSlug(entry.base, taken),
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
  await insertNodeIdentities(client, writes.map((write) => write.id), 'lore_fragment');
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
       title = EXCLUDED.title, prose = EXCLUDED.prose, tags = EXCLUDED.tags,
       source = EXCLUDED.source, source_id = EXCLUDED.source_id,
       batch_id = EXCLUDED.batch_id`,
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
