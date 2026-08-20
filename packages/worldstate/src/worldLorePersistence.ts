import type { HardStateKind, LoreFragment } from '@glass-frontier/dto';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

import type { GraphOperations } from './graphOperations';
import { withTransaction } from './pg';
import { normalizeTags, now, toSnakeCase } from './utils';

export type LoreCreateInput = {
  id?: string;
  slug?: string;
  entityId: string;
  source: { chronicleId?: string; beatId?: string };
  title: string;
  prose: string;
  tags?: string[];
  timestamp?: number;
};

export type LoreUpdateInput = {
  id: string;
  title?: string;
  prose?: string;
  tags?: string[];
  source?: { chronicleId?: string; beatId?: string };
};

type LoreFragmentRow = {
  id: string;
  slug: string;
  entity_id: string;
  chronicle_id: string | null;
  beat_id: string | null;
  title: string;
  prose: string;
  tags: string[];
  created_at: Date | null;
  entity_kind: HardStateKind;
};
type LoreInsert = {
  input: LoreCreateInput;
  id: string;
  slug: string;
  timestamp: number;
  tags: string[];
};

const LORE_SELECT = `SELECT lf.*, hs.kind AS entity_kind
  FROM lore_fragment lf JOIN hard_state hs ON hs.id = lf.entity_id`;

const toLoreFragment = (row: LoreFragmentRow): LoreFragment => ({
  entityId: row.entity_id,
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

export class WorldLorePersistence {
  readonly #pool: Pool;
  readonly #graph: GraphOperations;

  constructor(pool: Pool, graph: GraphOperations) {
    this.#pool = pool;
    this.#graph = graph;
  }

  async create(input: LoreCreateInput): Promise<LoreFragment> {
    const id = input.id ?? randomUUID();
    const slug = input.slug ?? `frag_${toSnakeCase(input.title)}_${id.slice(0, 8)}`;
    const timestamp = input.timestamp ?? now();
    const tags = normalizeTags(input.tags, 24);
    await withTransaction(this.#pool, async (client) => {
      await this.#assertEntityExists(client, input.entityId);
      await this.#graph.upsertNode(client, id, 'lore_fragment', {
        entityId: input.entityId,
        id,
        prose: input.prose,
        slug,
        source: input.source,
        tags,
        timestamp,
        title: input.title,
      });
      await this.#insert(client, { id, input, slug, tags, timestamp });
    });
    const fragment = await this.get({ id });
    if (fragment === null) {
      throw new Error('Failed to create lore fragment');
    }
    return fragment;
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

  async update(input: LoreUpdateInput): Promise<LoreFragment> {
    const fragment = await this.get({ id: input.id });
    if (fragment === null) {
      throw new Error('Lore fragment not found');
    }
    const tags = input.tags === undefined ? fragment.tags : normalizeTags(input.tags, 24);
    const source = {
      beatId: input.source?.beatId ?? fragment.source.beatId,
      chronicleId: input.source?.chronicleId ?? fragment.source.chronicleId,
    };
    const updated = {
      ...fragment,
      prose: input.prose ?? fragment.prose,
      source,
      tags,
      title: input.title ?? fragment.title,
    };
    await withTransaction(this.#pool, async (client) => {
      await this.#graph.upsertNode(client, input.id, 'lore_fragment', updated);
      await client.query(
        `UPDATE lore_fragment SET title = $1, prose = $2, tags = $3::text[],
         beat_id = $4, chronicle_id = $5::uuid WHERE id = $6::uuid`,
        [updated.title, updated.prose, tags, source.beatId ?? null,
          source.chronicleId ?? null, input.id]
      );
    });
    return updated;
  }

  async delete(input: { id: string }): Promise<void> {
    await withTransaction(this.#pool, async (client) => {
      await client.query('DELETE FROM lore_fragment WHERE id = $1::uuid', [input.id]);
      await this.#graph.deleteNode(client, input.id);
    });
  }

  async #insert(client: PoolClient, insert: LoreInsert): Promise<void> {
    const { id, input, slug, tags, timestamp } = insert;
    await client.query(
      `INSERT INTO lore_fragment
       (id, entity_id, chronicle_id, beat_id, slug, title, prose, tags, created_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8::text[],
       to_timestamp($9 / 1000.0))`,
      [id, input.entityId, input.source.chronicleId ?? null, input.source.beatId ?? null,
        slug, input.title, input.prose, tags, timestamp]
    );
  }

  async #assertEntityExists(client: PoolClient, entityId: string): Promise<void> {
    const result = await client.query(
      'SELECT 1 FROM hard_state WHERE id = $1::uuid', [entityId]
    );
    if (result.rowCount === 0) {
      throw new Error(`Hard state entity ${entityId} does not exist`);
    }
  }
}
