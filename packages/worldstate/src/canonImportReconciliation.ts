import type { PoolClient } from 'pg';

type ImportRelationshipIdentity = {
  dst: string;
  src: string;
  type: string;
};

type ImportSnapshot = {
  entityIds: string[];
  loreIds: string[];
  relationships: ImportRelationshipIdentity[];
};

const deleteRemovedImportRelationships = async (
  client: PoolClient,
  relationships: ImportRelationshipIdentity[]
): Promise<void> => {
  await client.query(
    `DELETE FROM edge AS stored
     WHERE stored.source = 'import'
       AND NOT EXISTS (
         SELECT 1
         FROM unnest($1::uuid[], $2::uuid[], $3::text[])
           AS desired(src_id, dst_id, type)
         WHERE desired.src_id = stored.src_id
           AND desired.dst_id = stored.dst_id
           AND desired.type = stored.type
       )`,
    [
      relationships.map((relationship) => relationship.src),
      relationships.map((relationship) => relationship.dst),
      relationships.map((relationship) => relationship.type),
    ]
  );
};

const deleteRemovedImportLore = async (
  client: PoolClient,
  loreIds: string[]
): Promise<void> => {
  await client.query(
    `DELETE FROM node AS stored
     WHERE stored.id IN (
       SELECT fragment.id
       FROM lore_fragment AS fragment
       WHERE fragment.source = 'import'
         AND NOT (fragment.id = ANY($1::uuid[]))
     )`,
    [loreIds]
  );
};

const deleteRemovedImportEntities = async (
  client: PoolClient,
  entityIds: string[]
): Promise<void> => {
  await client.query(
    `WITH stale_entities AS MATERIALIZED (
       SELECT entity.id
       FROM entity
       WHERE entity.source = 'import'
         AND NOT (entity.id = ANY($1::uuid[]))
     ), removed_nodes AS (
       SELECT id FROM stale_entities
       UNION ALL
       SELECT fragment.id
       FROM lore_fragment AS fragment
       WHERE fragment.entity_id IN (SELECT id FROM stale_entities)
     )
     DELETE FROM node AS stored
     USING removed_nodes
     WHERE stored.id = removed_nodes.id`,
    [entityIds]
  );
};

/** Removes import-owned rows omitted from the latest full source snapshot. */
export const reconcileImportSnapshot = async (
  client: PoolClient,
  snapshot: ImportSnapshot
): Promise<void> => {
  await deleteRemovedImportRelationships(client, snapshot.relationships);
  await deleteRemovedImportLore(client, snapshot.loreIds);
  await deleteRemovedImportEntities(client, snapshot.entityIds);
};
