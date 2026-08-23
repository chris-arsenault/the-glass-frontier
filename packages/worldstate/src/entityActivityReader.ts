import type {
  EntityActivityFeed,
  EntityActivityItem,
  EntityLoreActivityItem,
  HardStateKind,
  HardStateSubkind,
} from '@glass-frontier/dto';
import type { Pool } from 'pg';

type CreatedEntityRow = {
  created_at: Date;
  description: string | null;
  id: string;
  kind: HardStateKind;
  name: string;
  slug: string;
  subkind: HardStateSubkind | null;
};

type LoreUpdatedEntityRow = {
  activity_at: Date;
  entity_id: string;
  entity_kind: HardStateKind;
  entity_name: string;
  entity_slug: string;
  entity_subkind: HardStateSubkind | null;
  lore_prose: string;
  lore_title: string;
};

/** The two player-facing world activity lists used by the landing page. */
export class EntityActivityReader {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async getActivity(limitPerList = 5): Promise<EntityActivityFeed> {
    const capped = Math.max(1, Math.min(limitPerList, 20));
    const [created, loreUpdated] = await Promise.all([
      this.#listRecentlyCreated(capped),
      this.#listRecentlyUpdated(capped),
    ]);
    return { created, loreUpdated };
  }

  async #listRecentlyCreated(limit: number): Promise<EntityActivityItem[]> {
    const result = await this.#pool.query<CreatedEntityRow>(
      `SELECT e.id, e.slug, e.kind, e.subkind, e.name, e.description, e.created_at
       FROM entity e
       WHERE NOT e.dm AND NOT e.is_article
       ORDER BY e.created_at DESC, e.id ASC
       LIMIT $1`,
      [limit]
    );
    return result.rows.map((row) => ({
      activityAt: row.created_at.getTime(),
      id: row.id,
      kind: row.kind,
      name: row.name,
      slug: row.slug,
      subkind: row.subkind,
      summary: row.description,
    }));
  }

  async #listRecentlyUpdated(limit: number): Promise<EntityLoreActivityItem[]> {
    const result = await this.#pool.query<LoreUpdatedEntityRow>(
      `SELECT *
       FROM (
         SELECT DISTINCT ON (e.id)
           e.id AS entity_id,
           e.slug AS entity_slug,
           e.kind AS entity_kind,
           e.subkind AS entity_subkind,
           e.name AS entity_name,
           lf.title AS lore_title,
           lf.prose AS lore_prose,
           lf.created_at AS activity_at
         FROM entity e
         JOIN lore_fragment lf ON lf.entity_id = e.id
         WHERE NOT e.dm
           AND NOT e.is_article
           -- Transaction-stable now() gives creation-batch lore the same
           -- timestamp as its entity. Strictly later fragments are updates.
           AND lf.created_at > e.created_at
         ORDER BY e.id, lf.created_at DESC, lf.id DESC
       ) latest
       ORDER BY activity_at DESC, entity_id ASC
       LIMIT $1`,
      [limit]
    );
    return result.rows.map((row) => ({
      activityAt: row.activity_at.getTime(),
      id: row.entity_id,
      kind: row.entity_kind,
      loreTitle: row.lore_title,
      name: row.entity_name,
      slug: row.entity_slug,
      subkind: row.entity_subkind,
      summary: row.lore_prose,
    }));
  }
}
