import type { Pool, PoolClient } from 'pg';

/**
 * `node` is identity only: the row an edge can point at, and the kind it is.
 * It carries no properties — each domain owns its own table.
 */
export type NodeKind = 'entity' | 'lore_fragment' | 'character' | 'chronicle' | 'chronicle_turn';

export const upsertNodeIdentity = async (
  executor: PoolClient | Pool,
  id: string,
  kind: NodeKind
): Promise<void> => {
  await executor.query(
    `INSERT INTO node (id, kind, created_at) VALUES ($1::uuid, $2, now())
     ON CONFLICT (id) DO UPDATE SET kind = EXCLUDED.kind`,
    [id, kind]
  );
};

export const deleteNode = async (
  executor: PoolClient | Pool,
  id: string
): Promise<void> => {
  await executor.query('DELETE FROM node WHERE id = $1::uuid', [id]);
};
