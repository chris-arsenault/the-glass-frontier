import type {
  HardStateKind,
  HardStateStatus,
  HardStateSubkind,
  WorldKind,
  WorldSchema,
} from '@glass-frontier/dto';
import type { Pool } from 'pg';

type KindRow = {
  id: HardStateKind;
  category: string | null;
  display_name: string | null;
  default_status: HardStateStatus | null;
};
type SubkindRow = { id: HardStateSubkind; kind_id: HardStateKind };
type StatusRow = { status: HardStateStatus; kind_id: HardStateKind };
type RelationshipTypeRow = {
  id: string;
  description: string | null;
  category: string;
  default_strength: number;
};
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

/**
 * Read-only projection of the world vocabulary.
 *
 * The vocabulary is authored in `@glass-frontier/dto` and applied by the seed
 * step; these tables are its materialized form. Nothing mutates them at runtime.
 */
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
        `SELECT id, description, category, default_strength
         FROM world_relationship_kind WHERE category <> 'banned' ORDER BY id ASC`
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
        category: row.category,
        defaultStrength: row.default_strength,
        description: row.description ?? undefined,
        id: row.id,
      })),
    };
  }
}
