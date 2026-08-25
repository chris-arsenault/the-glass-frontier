import type { HardStateKind, LoreFragment } from '@glass-frontier/dto';
import type { Pool } from 'pg';

import { now, orSearchQuery } from './utils';

type LoreFragmentRow = {
  id: string;
  slug: string;
  entity_id: string;
  external_key: string | null;
  chronicle_id: string | null;
  beat_id: string | null;
  title: string;
  prose: string;
  tags: string[];
  created_at: Date | null;
  entity_kind: HardStateKind;
};

const LORE_SELECT = `SELECT lf.*, e.kind AS entity_kind
  FROM lore_fragment lf JOIN entity e ON e.id = lf.entity_id`;

const toLoreFragment = (row: LoreFragmentRow): LoreFragment => ({
  entityId: row.entity_id,
  externalKey: row.external_key ?? undefined,
  id: row.id,
  prose: row.prose,
  slug: row.slug,
  source: {
    beatId: row.beat_id ?? undefined,
    chronicleId: row.chronicle_id ?? undefined,
    entityKind: row.entity_kind,
  },
  tags: row.tags,
  timestamp: row.created_at?.getTime() ?? now(),
  title: row.title,
});

/**
 * Read access to lore. Fragments are written by `CanonWriter.commitBatch`
 * alongside the entities they belong to.
 */
export class LoreReader {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async get(input: { id: string }): Promise<LoreFragment | null> {
    const result = await this.#pool.query<LoreFragmentRow>(
      `${LORE_SELECT} WHERE lf.id = $1::uuid`, [input.id]
    );
    const row = result.rows[0];
    return row === undefined ? null : toLoreFragment(row);
  }

  async listByEntity(input: { entityId: string; limit?: number }): Promise<LoreFragment[]> {
    const limit = Math.max(1, Math.min(200, input.limit ?? 50));
    const result = await this.#pool.query<LoreFragmentRow>(
      `${LORE_SELECT} WHERE lf.entity_id = $1::uuid ORDER BY lf.created_at ASC LIMIT $2`,
      [input.entityId, limit]
    );
    return result.rows.map(toLoreFragment);
  }

  /**
   * Full-text search over lore prose, best match first. Fragments belonging
   * to DM-only entities are excluded; this is a player-facing read.
   */
  async search(input: {
    query: string;
    entityId?: string;
    limit?: number;
  }): Promise<LoreFragment[]> {
    const limit = Math.max(1, Math.min(20, input.limit ?? 5));
    const rows = await this.#searchRows(input.query, input.entityId ?? null, limit);
    if (rows.length > 0) {
      return rows.map(toLoreFragment);
    }
    const orQuery = orSearchQuery(input.query);
    if (orQuery === null) {
      return [];
    }
    const fallback = await this.#searchRows(orQuery, input.entityId ?? null, limit);
    return fallback.map(toLoreFragment);
  }

  /**
   * Fragments for several entities at once, capped per entity. Replaces a
   * per-entity query loop in context assembly.
   */
  async listByEntities(input: {
    entityIds: string[];
    perEntityLimit?: number;
  }): Promise<Map<string, LoreFragment[]>> {
    const grouped = new Map<string, LoreFragment[]>();
    if (input.entityIds.length === 0) {
      return grouped;
    }
    const perEntityLimit = Math.max(1, Math.min(50, input.perEntityLimit ?? 5));
    const result = await this.#pool.query<LoreFragmentRow>(
      `SELECT * FROM (
         SELECT lf.*, e.kind AS entity_kind,
           row_number() OVER (PARTITION BY lf.entity_id ORDER BY lf.created_at DESC) AS rn
         FROM lore_fragment lf
         JOIN entity e ON e.id = lf.entity_id
         WHERE lf.entity_id = ANY($1::uuid[])
       ) ranked
       WHERE rn <= $2
       ORDER BY entity_id, created_at ASC`,
      [input.entityIds, perEntityLimit]
    );
    for (const row of result.rows) {
      grouped.set(row.entity_id, [...(grouped.get(row.entity_id) ?? []), toLoreFragment(row)]);
    }
    return grouped;
  }

  async #searchRows(
    query: string,
    entityId: string | null,
    limit: number
  ): Promise<LoreFragmentRow[]> {
    const result = await this.#pool.query<LoreFragmentRow>(
      `${LORE_SELECT}
       WHERE lf.search @@ websearch_to_tsquery('english', $1)
       AND NOT e.dm
       AND ($2::uuid IS NULL OR lf.entity_id = $2::uuid)
       ORDER BY ts_rank(lf.search, websearch_to_tsquery('english', $1)) DESC LIMIT $3`,
      [query, entityId, limit]
    );
    return result.rows;
  }
}
