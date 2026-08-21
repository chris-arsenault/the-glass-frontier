import {
  RELATIONSHIP_RULES,
  RELATIONSHIP_TYPES,
  WORLD_KINDS,
  WORLD_PROMINENCE,
} from '@glass-frontier/dto';
import type { Pool, PoolClient } from 'pg';

import { withTransaction } from './pg';

/**
 * Applies the world vocabulary from `@glass-frontier/dto` to the database.
 *
 * Idempotent and authoritative: the artifact is the source of truth, so a value
 * removed from it is removed here. Runs after migrations on every deploy.
 */
export const seedVocabulary = async (pool: Pool): Promise<void> => {
  await withTransaction(pool, async (client) => {
    await seedProminence(client);
    await seedKinds(client);
    await seedRelationshipTypes(client);
    await seedRelationshipRules(client);
  });
};

const seedProminence = async (client: PoolClient): Promise<void> => {
  await client.query(
    `INSERT INTO world_prominence (id, rank)
     SELECT id, rank FROM unnest($1::text[], $2::int[]) AS t(id, rank)
     ON CONFLICT (id) DO UPDATE SET rank = EXCLUDED.rank`,
    [WORLD_PROMINENCE.map((tier) => tier.id), WORLD_PROMINENCE.map((tier) => tier.rank)]
  );
};

const seedKinds = async (client: PoolClient): Promise<void> => {
  await client.query(
    `INSERT INTO world_kind (id, category, display_name, default_status, created_at, updated_at)
     SELECT id, category, display_name, default_status, now(), now()
     FROM unnest($1::text[], $2::text[], $3::text[], $4::text[])
       AS t(id, category, display_name, default_status)
     ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category,
       display_name = EXCLUDED.display_name,
       default_status = EXCLUDED.default_status,
       updated_at = now()`,
    [
      WORLD_KINDS.map((kind) => kind.id),
      WORLD_KINDS.map((kind) => kind.category),
      WORLD_KINDS.map((kind) => kind.displayName),
      WORLD_KINDS.map((kind) => kind.defaultStatus),
    ]
  );

  const subkinds = WORLD_KINDS.flatMap((kind) =>
    kind.subkinds.map((subkind) => ({ id: subkind, kindId: kind.id }))
  );
  await client.query(
    `INSERT INTO world_subkind (id, kind_id, created_at)
     SELECT id, kind_id, now() FROM unnest($1::text[], $2::text[]) AS t(id, kind_id)
     ON CONFLICT ON CONSTRAINT world_subkind_pk DO NOTHING`,
    [subkinds.map((entry) => entry.id), subkinds.map((entry) => entry.kindId)]
  );

  const statuses = WORLD_KINDS.flatMap((kind) =>
    kind.statuses.map((status) => ({ kindId: kind.id, status }))
  );
  await client.query(
    `INSERT INTO world_kind_status (kind_id, status)
     SELECT kind_id, status FROM unnest($1::text[], $2::text[]) AS t(kind_id, status)
     ON CONFLICT ON CONSTRAINT world_kind_status_pk DO NOTHING`,
    [statuses.map((entry) => entry.kindId), statuses.map((entry) => entry.status)]
  );
};

const seedRelationshipTypes = async (client: PoolClient): Promise<void> => {
  await client.query(
    `INSERT INTO world_relationship_kind (id, description, category, default_strength)
     SELECT id, description, category, default_strength
     FROM unnest($1::text[], $2::text[], $3::text[], $4::real[])
       AS t(id, description, category, default_strength)
     ON CONFLICT (id) DO UPDATE SET description = EXCLUDED.description,
       category = EXCLUDED.category, default_strength = EXCLUDED.default_strength`,
    [
      RELATIONSHIP_TYPES.map((type) => type.id),
      RELATIONSHIP_TYPES.map((type) => type.description),
      RELATIONSHIP_TYPES.map((type) => type.category),
      RELATIONSHIP_TYPES.map((type) => type.defaultStrength),
    ]
  );
};

const seedRelationshipRules = async (client: PoolClient): Promise<void> => {
  await client.query(
    `INSERT INTO world_relationship_rule (relationship_id, src_kind, dst_kind)
     SELECT relationship_id, src_kind, dst_kind
     FROM unnest($1::text[], $2::text[], $3::text[])
       AS t(relationship_id, src_kind, dst_kind)
     ON CONFLICT ON CONSTRAINT world_relationship_rule_pk DO NOTHING`,
    [
      RELATIONSHIP_RULES.map((rule) => rule.relationshipId),
      RELATIONSHIP_RULES.map((rule) => rule.srcKind),
      RELATIONSHIP_RULES.map((rule) => rule.dstKind),
    ]
  );

  // The artifact is authoritative: a rule it no longer declares is withdrawn.
  await client.query(
    `DELETE FROM world_relationship_rule wrr
     WHERE NOT EXISTS (
       SELECT 1 FROM unnest($1::text[], $2::text[], $3::text[])
         AS t(relationship_id, src_kind, dst_kind)
       WHERE t.relationship_id = wrr.relationship_id
         AND t.src_kind = wrr.src_kind
         AND t.dst_kind = wrr.dst_kind
     )`,
    [
      RELATIONSHIP_RULES.map((rule) => rule.relationshipId),
      RELATIONSHIP_RULES.map((rule) => rule.srcKind),
      RELATIONSHIP_RULES.map((rule) => rule.dstKind),
    ]
  );
};
