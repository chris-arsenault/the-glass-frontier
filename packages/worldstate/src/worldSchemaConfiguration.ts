import type {
  HardStateKind,
  HardStateStatus,
  HardStateSubkind,
  WorldKind,
  WorldRelationshipRule,
  WorldRelationshipType,
  WorldSchema,
} from '@glass-frontier/dto';
import type { Pool, PoolClient } from 'pg';

import { withTransaction } from './pg';

export type KindInput = {
  id: HardStateKind;
  category?: string | null;
  displayName?: string | null;
  defaultStatus?: HardStateStatus | null;
  subkinds?: HardStateSubkind[];
  statuses?: HardStateStatus[];
};

type KindRow = {
  id: HardStateKind;
  category: string | null;
  display_name: string | null;
  default_status: HardStateStatus | null;
};
type SubkindRow = { id: HardStateSubkind; kind_id: HardStateKind };
type StatusRow = { status: HardStateStatus; kind_id: HardStateKind };
type RelationshipTypeRow = { id: string; description: string | null };
type RelationshipRuleRow = {
  relationship_id: string;
  src_kind: HardStateKind;
  dst_kind: HardStateKind;
};

const assembleKinds = (
  kinds: KindRow[], subkinds: SubkindRow[], statuses: StatusRow[]
): WorldKind[] => {
  const byId = new Map<HardStateKind, WorldKind>();
  for (const row of kinds) {
    byId.set(row.id, {
      category: row.category ?? undefined,
      defaultStatus: row.default_status ?? undefined,
      displayName: row.display_name ?? undefined,
      id: row.id,
      statuses: [],
      subkinds: [],
    });
  }
  for (const row of subkinds) {
    byId.get(row.kind_id)?.subkinds.push(row.id);
  }
  for (const row of statuses) {
    byId.get(row.kind_id)?.statuses.push(row.status);
  }
  return [...byId.values()];
};

export class WorldSchemaConfiguration {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async getSchema(): Promise<WorldSchema> {
    const [kinds, subkinds, statuses, relationshipTypes, relationshipRules] = await Promise.all([
      this.#pool.query<KindRow>(
        'SELECT id, category, display_name, default_status FROM world_kind ORDER BY id ASC'
      ),
      this.#pool.query<SubkindRow>('SELECT id, kind_id FROM world_subkind'),
      this.#pool.query<StatusRow>('SELECT status, kind_id FROM world_kind_status'),
      this.#pool.query<RelationshipTypeRow>(
        'SELECT id, description FROM world_relationship_kind ORDER BY id ASC'
      ),
      this.#pool.query<RelationshipRuleRow>(
        `SELECT relationship_id, src_kind, dst_kind
         FROM world_relationship_rule ORDER BY relationship_id ASC`
      ),
    ]);
    return {
      kinds: assembleKinds(kinds.rows, subkinds.rows, statuses.rows),
      relationshipRules: relationshipRules.rows.map((row) => ({
        dstKind: row.dst_kind,
        relationshipId: row.relationship_id,
        srcKind: row.src_kind,
      })),
      relationshipTypes: relationshipTypes.rows.map((row) => ({
        description: row.description ?? undefined,
        id: row.id,
      })),
    };
  }

  async upsertKind(input: KindInput): Promise<WorldKind> {
    await withTransaction(this.#pool, async (client) => {
      await client.query(
        `INSERT INTO world_kind (id, category, display_name, default_status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, now(), now())
         ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category,
         display_name = EXCLUDED.display_name, default_status = EXCLUDED.default_status,
         updated_at = now()`,
        [input.id, input.category ?? null, input.displayName ?? null, input.defaultStatus ?? null]
      );
      await this.#replaceSubkinds(client, input.id, input.subkinds);
      await this.#replaceStatuses(client, input.id, input.statuses);
    });
    const kind = (await this.getSchema()).kinds.find((candidate) => candidate.id === input.id);
    if (kind === undefined) {
      throw new Error('Failed to upsert kind');
    }
    return kind;
  }

  async addRelationshipType(input: {
    id: string;
    description?: string | null;
  }): Promise<WorldRelationshipType> {
    await this.#pool.query(
      `INSERT INTO world_relationship_kind (id, description) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET description = EXCLUDED.description`,
      [input.id, input.description ?? null]
    );
    return { description: input.description ?? undefined, id: input.id };
  }

  async upsertRelationshipRule(input: WorldRelationshipRule): Promise<void> {
    await withTransaction(this.#pool, async (client) => {
      await Promise.all([
        this.#assertExists(client, 'world_relationship_kind', input.relationshipId),
        this.#assertExists(client, 'world_kind', input.srcKind),
        this.#assertExists(client, 'world_kind', input.dstKind),
      ]);
      await client.query(
        `INSERT INTO world_relationship_rule (relationship_id, src_kind, dst_kind)
         VALUES ($1, $2, $3)
         ON CONFLICT ON CONSTRAINT world_relationship_rule_pk DO NOTHING`,
        [input.relationshipId, input.srcKind, input.dstKind]
      );
    });
  }

  async deleteRelationshipRule(input: WorldRelationshipRule): Promise<void> {
    await this.#pool.query(
      `DELETE FROM world_relationship_rule
       WHERE relationship_id = $1 AND src_kind = $2 AND dst_kind = $3`,
      [input.relationshipId, input.srcKind, input.dstKind]
    );
  }

  async #replaceSubkinds(
    client: PoolClient, kind: HardStateKind, values?: HardStateSubkind[]
  ): Promise<void> {
    if (values === undefined) {
      return;
    }
    await client.query('DELETE FROM world_subkind WHERE kind_id = $1', [kind]);
    if (values.length > 0) {
      await client.query(
        `INSERT INTO world_subkind (id, kind_id, created_at)
         SELECT value, $1, now() FROM unnest($2::text[]) AS value`, [kind, values]
      );
    }
  }

  async #replaceStatuses(
    client: PoolClient, kind: HardStateKind, values?: HardStateStatus[]
  ): Promise<void> {
    if (values === undefined) {
      return;
    }
    await client.query('DELETE FROM world_kind_status WHERE kind_id = $1', [kind]);
    if (values.length > 0) {
      await client.query(
        `INSERT INTO world_kind_status (kind_id, status)
         SELECT $1, value FROM unnest($2::text[]) AS value`, [kind, values]
      );
    }
  }

  async #assertExists(
    client: PoolClient,
    table: 'world_kind' | 'world_relationship_kind',
    id: string
  ): Promise<void> {
    const query = table === 'world_kind'
      ? 'SELECT 1 FROM world_kind WHERE id = $1'
      : 'SELECT 1 FROM world_relationship_kind WHERE id = $1';
    const result = await client.query(query, [id]);
    if (result.rowCount === 0) {
      throw new Error(`${table} entry ${id} is not configured`);
    }
  }
}
