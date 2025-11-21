import type {
  HardState,
  HardStateKind,
  HardStateLink,
  HardStateProminence,
  HardStateSubkind,
  HardStateStatus,
  WorldNeighbor,
  LoreFragment,
  WorldKind,
  LocationPlace,
  LocationState,
  WorldRelationshipRule,
  WorldRelationshipType,
  WorldSchema,
} from '@glass-frontier/dto';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

import { GraphOperations } from './graphOperations';
import { createPool, withTransaction } from './pg';
import type { WorldSchemaStore } from './types';
import { normalizeTags, now, toSnakeCase } from './utils';

type KindRow = {
  id: HardStateKind;
  category: string | null;
  display_name: string | null;
  default_status: string | null;
};

type HardStateRow = {
  id: string;
  slug: string;
  kind: HardStateKind;
  subkind: string | null;
  name: string;
  description: string | null;
  prominence: HardStateProminence;
  prominence_rank?: number;
  status: HardStateStatus | null;
  created_at: Date | null;
  updated_at: Date | null;
};

type LoreFragmentRow = {
  id: string;
  entity_id: string;
  chronicle_id: string | null;
  beat_id: string | null;
  title: string;
  prose: string;
  tags: string[];
  created_at: Date | null;
  entity_kind: HardStateKind;
};

const toHardState = (row: HardStateRow, links: HardStateLink[]): HardState => ({
  id: row.id,
  slug: row.slug,
  kind: row.kind,
  subkind: row.subkind ?? undefined,
  name: row.name,
  description: row.description ?? undefined,
  prominence: row.prominence ?? 'recognized',
  status: row.status ?? undefined,
  links,
  createdAt: row.created_at?.getTime() ?? now(),
  updatedAt: row.updated_at?.getTime() ?? now(),
});

const toLoreFragment = (row: LoreFragmentRow): LoreFragment => ({
  id: row.id,
  entityId: row.entity_id,
  source: {
    chronicleId: row.chronicle_id ?? undefined,
    beatId: row.beat_id ?? undefined,
    entityKind: row.entity_kind,
  },
  title: row.title,
  prose: row.prose,
  tags: Array.isArray(row.tags) ? row.tags : [],
  timestamp: row.created_at?.getTime() ?? now(),
});

const toLocationPlace = (state: HardState): LocationPlace => ({
  createdAt: state.createdAt,
  id: state.id,
  kind: 'location',
  name: state.name,
  description: state.description ?? undefined,
  prominence: state.prominence ?? 'recognized',
  slug: state.slug,
  status: state.status ?? undefined,
  subkind: state.subkind ?? undefined,
  tags: [],
  updatedAt: state.updatedAt,
});

const PROMINENCE_RANK: Record<HardStateProminence, number> = {
  forgotten: 0,
  marginal: 1,
  recognized: 2,
  renowned: 3,
  mythic: 4,
};

class PostgresWorldSchemaStore implements WorldSchemaStore {
  readonly #pool: Pool;
  readonly #graph: GraphOperations;

  constructor(options: { pool: Pool; graph?: GraphOperations }) {
    this.#pool = options.pool;
    this.#graph = options.graph ?? new GraphOperations(options.pool);
  }

  async upsertHardState(input: {
    id?: string;
    kind: HardStateKind;
    subkind?: HardStateSubkind | null;
    name: string;
    description?: string | null;
    prominence?: HardStateProminence | null;
    status?: HardStateStatus | null;
    links?: Array<{ relationship: string; targetId: string }>;
  }): Promise<HardState> {
    const id = input.id ?? randomUUID();
    const normalizedLinks = this.#sanitizeLinks(input.links);
    const description = input.description?.trim() ?? null;
    await withTransaction(this.#pool, async (client) => {
      const kindRow = await this.#getKind(client, input.kind);
      const status = await this.#resolveStatus(client, input.kind, input.status ?? kindRow.default_status);
      await this.#assertSubkind(client, input.kind, input.subkind ?? null);
      const prominence = input.prominence ?? 'recognized';
      await this.#assertProminence(prominence);

      const slug = await this.#reserveSlug(client, toSnakeCase(input.name), id);
      await this.#graph.upsertNode(client, id, 'world_entity', {
        id,
        slug,
        kind: input.kind,
        subkind: input.subkind ?? undefined,
        name: input.name,
        description: description ?? undefined,
        prominence,
        status: status ?? undefined,
        links: normalizedLinks,
      });

      await client.query(
        `INSERT INTO hard_state (id, slug, kind, subkind, name, description, prominence, status, created_at, updated_at)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, now(), now())
         ON CONFLICT (id) DO UPDATE
         SET slug = EXCLUDED.slug,
             kind = EXCLUDED.kind,
             subkind = EXCLUDED.subkind,
             name = EXCLUDED.name,
             description = EXCLUDED.description,
             prominence = EXCLUDED.prominence,
             status = EXCLUDED.status,
             updated_at = now()`,
        [id, slug, input.kind, input.subkind ?? null, input.name, input.description ?? null, prominence, status ?? null]
      );

      if (input.links) {
        await this.#syncRelationships(client, id, normalizedLinks);
      }
    });

    const persisted = await this.getHardState({ id });
    if (!persisted) {
      throw new Error('Failed to upsert hard state');
    }
    return persisted;
  }

  async deleteHardState(input: { id: string }): Promise<void> {
    await withTransaction(this.#pool, async (client) => {
      await client.query(
        `DELETE FROM edge
         WHERE type IN (SELECT id FROM world_relationship_kind)
           AND (src_id = $1::uuid OR dst_id = $1::uuid)`,
        [input.id]
      );
      await client.query('DELETE FROM hard_state WHERE id = $1::uuid', [input.id]);
      await this.#graph.deleteNode(client, input.id);
    });
  }

  async upsertRelationship(input: {
    srcId: string;
    dstId: string;
    relationship: string;
  }): Promise<void> {
    await withTransaction(this.#pool, async (client) => {
      await this.#assertRelationshipAllowed(client, input.relationship, input.srcId, input.dstId);
      await this.#graph.upsertEdge(client, {
        src: input.srcId,
        dst: input.dstId,
        type: input.relationship,
        props: {},
      });
    });
  }

  async deleteRelationship(input: { srcId: string; dstId: string; relationship: string }): Promise<void> {
    await this.#pool.query(
      `DELETE FROM edge WHERE src_id = $1::uuid AND dst_id = $2::uuid AND type = $3`,
      [input.srcId, input.dstId, input.relationship]
    );
  }

  async getHardState(input: { id: string }): Promise<HardState | null> {
    const result = await this.#pool.query(
      `SELECT hs.id, hs.slug, hs.kind, hs.subkind, hs.name, hs.description, hs.prominence, hs.status, hs.created_at, hs.updated_at, wp.rank as prominence_rank
       FROM hard_state hs
       JOIN world_prominence wp ON wp.id = hs.prominence
       WHERE hs.id = $1::uuid`,
      [input.id]
    );
    const row = result.rows[0] as HardStateRow | undefined;
    if (!row) {
      return null;
    }
    const links = await this.#listLinks(row.id);
    return toHardState(row, links);
  }

  async listHardStates(input?: {
    kind?: HardStateKind;
    limit?: number;
    minProminence?: HardStateProminence;
    maxProminence?: HardStateProminence;
  }): Promise<HardState[]> {
    const limit = Math.max(1, Math.min(200, input?.limit ?? 100));
    const params: Array<string | number> = [limit];
    const clauses: string[] = [];
    if (input?.kind) {
      params.push(input.kind);
      clauses.push(`hs.kind = $${params.length}`);
    }
    const mapOrder = (value: HardStateProminence) =>
      ['forgotten', 'marginal', 'recognized', 'renowned', 'mythic'].indexOf(value);
    if (input?.minProminence) {
      params.push(mapOrder(input.minProminence));
      clauses.push(`wp.rank >= $${params.length}`);
    }
    if (input?.maxProminence) {
      params.push(mapOrder(input.maxProminence));
      clauses.push(`wp.rank <= $${params.length}`);
    }
    const filter = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await this.#pool.query(
      `SELECT hs.id, hs.slug, hs.kind, hs.subkind, hs.name, hs.description, hs.prominence, hs.status, hs.created_at, hs.updated_at, wp.rank as prominence_rank
       FROM hard_state hs
       JOIN world_prominence wp ON wp.id = hs.prominence
       ${filter}
       ORDER BY wp.rank ASC, hs.created_at ASC
       LIMIT $1`,
      params
    );

    const ids = result.rows.map((row: HardStateRow) => row.id);
    const linkLookup = await this.#listLinksForMany(ids);

    return result.rows.map((row) =>
      toHardState(row as HardStateRow, linkLookup.get(row.id) ?? [])
    );
  }

  async getHardStateBySlug(input: { slug: string }): Promise<HardState | null> {
    const result = await this.#pool.query(
      `SELECT hs.id, hs.slug, hs.kind, hs.subkind, hs.name, hs.description, hs.prominence, hs.status, hs.created_at, hs.updated_at, wp.rank as prominence_rank
       FROM hard_state hs
       JOIN world_prominence wp ON wp.id = hs.prominence
       WHERE hs.slug = $1`,
      [input.slug]
    );
    const row = result.rows[0] as HardStateRow | undefined;
    if (!row) {
      return null;
    }
    const links = await this.#listLinks(row.id);
    return toHardState(row, links);
  }

  async listNeighborsForKind(input: {
    id: string;
    kind: HardStateKind;
    minProminence?: HardStateProminence;
    maxProminence?: HardStateProminence;
    maxHops?: number;
    limit?: number;
  }): Promise<WorldNeighbor[]> {
    return this.#listNeighbors({
      anchorId: input.id,
      kind: input.kind,
      minProminence: input.minProminence ?? 'recognized',
      maxProminence: input.maxProminence,
      maxHops: input.maxHops ?? 2,
      limit: input.limit,
    });
  }

  async createLoreFragment(input: {
    id?: string;
    entityId: string;
    source: {
      chronicleId?: string;
      beatId?: string;
    };
    title: string;
    prose: string;
    tags?: string[];
    timestamp?: number;
  }): Promise<LoreFragment> {
    const id = input.id ?? randomUUID();
    const timestamp = input.timestamp ?? now();
    const tags = normalizeTags(input.tags, 24);

    await withTransaction(this.#pool, async (client) => {
      await this.#assertHardStatesExist(client, input.entityId);
      await this.#graph.upsertNode(client, id, 'lore_fragment', {
        id,
        entityId: input.entityId,
        source: input.source,
        title: input.title,
        prose: input.prose,
        tags,
        timestamp,
      });
      await client.query(
        `INSERT INTO lore_fragment (
           id, entity_id, chronicle_id, beat_id,
           title, prose, tags, created_at
         ) VALUES (
           $1::uuid, $2::uuid, $3::uuid, $4,
           $5, $6, $7::text[], to_timestamp($8 / 1000.0)
         )`,
        [
          id,
          input.entityId,
          input.source.chronicleId ?? null,
          input.source.beatId ?? null,
          input.title,
          input.prose,
          tags,
          timestamp,
        ]
      );
    });

    const fragment = await this.getLoreFragment({ id });
    if (!fragment) {
      throw new Error('Failed to create lore fragment');
    }
    return fragment;
  }

  async getWorldSchema(): Promise<WorldSchema> {
    const kinds = await this.#pool.query(
      `SELECT id, category, display_name, default_status
       FROM world_kind
       ORDER BY id ASC`
    );
    const subkinds = await this.#pool.query(
      `SELECT id, kind_id FROM world_subkind`
    );
    const statuses = await this.#pool.query(
      `SELECT status, kind_id FROM world_kind_status`
    );
    const relationshipTypes = await this.#pool.query(
      `SELECT id, description FROM world_relationship_kind ORDER BY id ASC`
    );
    const relationshipRules = await this.#pool.query(
      `SELECT relationship_id, src_kind, dst_kind FROM world_relationship_rule ORDER BY relationship_id ASC`
    );

    const kindsById = new Map<string, WorldKind>();
    for (const row of kinds.rows) {
      kindsById.set(row.id, {
        id: row.id as HardStateKind,
        category: row.category ?? undefined,
        displayName: row.display_name ?? undefined,
        defaultStatus: row.default_status ?? undefined,
        subkinds: [],
        statuses: [],
      });
    }
    for (const row of subkinds.rows) {
      const target = kindsById.get(row.kind_id);
      if (target) {
        target.subkinds.push(row.id as HardStateSubkind);
      }
    }
    for (const row of statuses.rows) {
      const target = kindsById.get(row.kind_id);
      if (target) {
        target.statuses.push(row.status as HardStateStatus);
      }
    }

    return {
      kinds: Array.from(kindsById.values()),
      relationshipTypes: relationshipTypes.rows.map((row) => ({
        id: row.id as string,
        description: row.description ?? undefined,
      })),
      relationshipRules: relationshipRules.rows.map((row) => ({
        relationshipId: row.relationship_id as string,
        srcKind: row.src_kind as HardStateKind,
        dstKind: row.dst_kind as HardStateKind,
      })),
    };
  }

  async upsertKind(input: {
    id: HardStateKind;
    category?: string | null;
    displayName?: string | null;
    defaultStatus?: HardStateStatus | null;
    subkinds?: HardStateSubkind[];
    statuses?: HardStateStatus[];
  }): Promise<WorldKind> {
    await withTransaction(this.#pool, async (client) => {
      await client.query(
        `INSERT INTO world_kind (id, category, display_name, default_status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, now(), now())
         ON CONFLICT (id) DO UPDATE
         SET category = EXCLUDED.category,
             display_name = EXCLUDED.display_name,
             default_status = EXCLUDED.default_status,
             updated_at = now()`,
        [input.id, input.category ?? null, input.displayName ?? null, input.defaultStatus ?? null]
      );
      if (input.subkinds) {
        await client.query(`DELETE FROM world_subkind WHERE kind_id = $1`, [input.id]);
        for (const subkind of input.subkinds) {
          await client.query(
            `INSERT INTO world_subkind (id, kind_id, created_at)
             VALUES ($1, $2, now())`,
            [subkind, input.id]
          );
        }
      }
      if (input.statuses) {
        await client.query(`DELETE FROM world_kind_status WHERE kind_id = $1`, [input.id]);
        for (const status of input.statuses) {
          await client.query(
            `INSERT INTO world_kind_status (kind_id, status)
             VALUES ($1, $2)`,
            [input.id, status]
          );
        }
      }
    });
    const schema = await this.getWorldSchema();
    const next = schema.kinds.find((kind) => kind.id === input.id);
    if (!next) {
      throw new Error('Failed to upsert kind');
    }
    return next;
  }

  async addRelationshipType(input: { id: string; description?: string | null }): Promise<WorldRelationshipType> {
    await this.#pool.query(
      `INSERT INTO world_relationship_kind (id, description)
       VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET description = EXCLUDED.description`,
      [input.id, input.description ?? null]
    );
    return { id: input.id, description: input.description ?? undefined };
  }

  async upsertRelationshipRule(input: WorldRelationshipRule): Promise<void> {
    await withTransaction(this.#pool, async (client) => {
      await this.#assertRelationshipTypeExists(client, input.relationshipId);
      await this.#assertKind(client, input.srcKind);
      await this.#assertKind(client, input.dstKind);
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

  async getLoreFragment(input: { id: string }): Promise<LoreFragment | null> {
    const result = await this.#pool.query(
      `SELECT lf.*, hs.kind as entity_kind
       FROM lore_fragment lf
       JOIN hard_state hs ON hs.id = lf.entity_id
       WHERE lf.id = $1::uuid`,
      [input.id]
    );
    const row = result.rows[0] as LoreFragmentRow | undefined;
    if (!row) {
      return null;
    }
    return toLoreFragment(row);
  }

  async listLoreFragmentsByEntity(input: { entityId: string; limit?: number }): Promise<LoreFragment[]> {
    const limit = Math.max(1, Math.min(200, input.limit ?? 50));
    const result = await this.#pool.query(
      `SELECT lf.*, hs.kind as entity_kind
       FROM lore_fragment lf
       JOIN hard_state hs ON hs.id = lf.entity_id
       WHERE lf.entity_id = $1::uuid
       ORDER BY lf.created_at ASC
       LIMIT $2`,
      [input.entityId, limit]
    );
    return result.rows.map((row) => toLoreFragment(row as LoreFragmentRow));
  }

  async updateLoreFragment(input: {
    id: string;
    title?: string;
    prose?: string;
    tags?: string[];
    source?: { chronicleId?: string; beatId?: string };
  }): Promise<LoreFragment> {
    const fragment = await this.getLoreFragment({ id: input.id });
    if (!fragment) {
      throw new Error('Lore fragment not found');
    }
    const nextTags = input.tags ? normalizeTags(input.tags, 24) : fragment.tags;
    const nextSource = {
      chronicleId: input.source?.chronicleId ?? fragment.source.chronicleId,
      beatId: input.source?.beatId ?? fragment.source.beatId,
    };
    await withTransaction(this.#pool, async (client) => {
      await this.#graph.upsertNode(client, input.id, 'lore_fragment', {
        ...fragment,
        title: input.title ?? fragment.title,
        prose: input.prose ?? fragment.prose,
        tags: nextTags,
        source: nextSource,
      });
      await client.query(
        `UPDATE lore_fragment
         SET title = $1,
             prose = $2,
             tags = $3::text[],
             beat_id = $4,
             chronicle_id = $5::uuid
         WHERE id = $6::uuid`,
        [
          input.title ?? fragment.title,
          input.prose ?? fragment.prose,
          nextTags,
          nextSource.beatId ?? null,
          nextSource.chronicleId ?? null,
          input.id,
        ]
      );
    });
    const updated = await this.getLoreFragment({ id: input.id });
    if (!updated) {
      throw new Error('Failed to update lore fragment');
    }
    return updated;
  }

  async deleteLoreFragment(input: { id: string }): Promise<void> {
    await withTransaction(this.#pool, async (client) => {
      await client.query('DELETE FROM lore_fragment WHERE id = $1::uuid', [input.id]);
      await this.#graph.deleteNode(client, input.id);
    });
  }

  async moveCharacterToLocation(input: {
    characterId: string;
    locationId: string;
    note?: string | null;
  }): Promise<LocationState> {
    await withTransaction(this.#pool, async (client) => {
      await this.#assertCharacterNode(client, input.characterId);
      await this.#assertLocationExists(client, input.locationId);
      await client.query('DELETE FROM edge WHERE src_id = $1::uuid AND type = $2', [
        input.characterId,
        'resides_in',
      ]);
      await this.#graph.upsertEdge(client, {
        src: input.characterId,
        dst: input.locationId,
        type: 'resides_in',
        props: { note: input.note ?? undefined },
      });
    });
    return {
      characterId: input.characterId,
      locationId: input.locationId,
      note: input.note ?? undefined,
      updatedAt: Date.now(),
    };
  }

  async #getKind(executor: PoolClient, kind: HardStateKind): Promise<KindRow> {
    const result = await executor.query(
      `SELECT id, category, display_name, default_status
       FROM world_kind
       WHERE id = $1`,
      [kind]
    );
    const row = result.rows[0] as KindRow | undefined;
    if (!row) {
      throw new Error(`Hard state kind ${kind} is not configured`);
    }
    return row;
  }

  async #resolveStatus(
    executor: PoolClient,
    kind: HardStateKind,
    status: string | null
  ): Promise<HardStateStatus | null> {
    if (status === null) {
      return null;
    }
    const result = await executor.query(
      `SELECT 1 FROM world_kind_status WHERE kind_id = $1 AND status = $2`,
      [kind, status]
    );
    if (!result.rowCount) {
      throw new Error(`Status ${status} is not allowed for kind ${kind}`);
    }
    return status as HardStateStatus;
  }

  async #assertSubkind(
    executor: PoolClient,
    kind: HardStateKind,
    subkind: string | null
  ): Promise<void> {
    if (!subkind) {
      return;
    }
    const result = await executor.query(
      `SELECT 1 FROM world_subkind WHERE id = $1 AND kind_id = $2`,
      [subkind, kind]
    );
    if (!result.rowCount) {
      throw new Error(`Subkind ${subkind} is not allowed for kind ${kind}`);
    }
  }

  async #assertRelationshipTypeExists(executor: PoolClient, relationshipId: string): Promise<void> {
    const result = await executor.query(
      `SELECT 1 FROM world_relationship_kind WHERE id = $1`,
      [relationshipId]
    );
    if (!result.rowCount) {
      throw new Error(`Relationship type ${relationshipId} is not configured`);
    }
  }

  async #assertProminence(value: HardStateProminence): Promise<void> {
    const result = await this.#pool.query(
      `SELECT 1 FROM world_prominence WHERE id = $1`,
      [value]
    );
    if (!result.rowCount) {
      throw new Error(`Invalid prominence value: ${value}`);
    }
  }

  async #assertKind(executor: PoolClient, kind: HardStateKind): Promise<void> {
    const result = await executor.query(
      `SELECT 1 FROM world_kind WHERE id = $1`,
      [kind]
    );
    if (!result.rowCount) {
      throw new Error(`Hard state kind ${kind} is not configured`);
    }
  }

  async #syncRelationships(
    executor: PoolClient,
    entityId: string,
    links: Array<{ relationship: string; targetId: string }>
  ): Promise<void> {
    await executor.query(
      `DELETE FROM edge
       WHERE type IN (SELECT id FROM world_relationship_kind)
         AND (src_id = $1::uuid OR dst_id = $1::uuid)`,
      [entityId]
    );
    for (const link of links) {
      await this.#assertRelationshipAllowed(executor, link.relationship, entityId, link.targetId);
      await this.#graph.upsertEdge(executor, {
        src: entityId,
        dst: link.targetId,
        type: link.relationship,
        props: {},
      });
    }
  }

  async #assertRelationshipAllowed(
    executor: PoolClient,
    relationship: string,
    srcId: string,
    dstId: string
  ): Promise<void> {
    const kinds = await executor.query(
      `SELECT id, kind FROM hard_state WHERE id = ANY($1::uuid[])`,
      [[srcId, dstId]]
    );
    if (kinds.rowCount !== 2) {
      throw new Error('Relationship targets must both be hard state entities');
    }
    const srcKind = kinds.rows.find((row) => row.id === srcId)?.kind as HardStateKind | undefined;
    const dstKind = kinds.rows.find((row) => row.id === dstId)?.kind as HardStateKind | undefined;
    if (!srcKind || !dstKind) {
      throw new Error('Unable to resolve kinds for relationship endpoints');
    }
    const rule = await executor.query(
      `SELECT 1
       FROM world_relationship_rule
       WHERE relationship_id = $1 AND src_kind = $2 AND dst_kind = $3`,
      [relationship, srcKind, dstKind]
    );
    if (!rule.rowCount) {
      throw new Error(`Relationship ${relationship} is not allowed between ${srcKind} and ${dstKind}`);
    }
  }

  async #assertHardStatesExist(executor: PoolClient, ...entityIds: string[]): Promise<void> {
    if (entityIds.length === 0) {
      return;
    }
    const unique = Array.from(new Set(entityIds));
    const result = await executor.query(
      `SELECT id FROM hard_state WHERE id = ANY($1::uuid[])`,
      [unique]
    );
    if (result.rowCount !== unique.length) {
      throw new Error('One or more hard state entities do not exist');
    }
  }

  async #assertCharacterNode(executor: PoolClient, characterId: string): Promise<void> {
    const result = await executor.query(
      `SELECT kind FROM node WHERE id = $1::uuid`,
      [characterId]
    );
    if (!result.rowCount) {
      throw new Error(`Character ${characterId} not found`);
    }
    if (result.rows[0]?.kind !== 'character') {
      throw new Error(`Node ${characterId} is not a character`);
    }
  }

  async #assertLocationExists(executor: PoolClient, locationId: string): Promise<void> {
    const result = await executor.query(
      `SELECT kind FROM hard_state WHERE id = $1::uuid`,
      [locationId]
    );
    if (!result.rowCount || result.rows[0]?.kind !== 'location') {
      throw new Error(`Location ${locationId} not found`);
    }
  }

  #sanitizeLinks(
    links?: Array<{ relationship: string; targetId: string }>
  ): Array<{ relationship: string; targetId: string }> {
    if (!Array.isArray(links)) {
      return [];
    }
    const unique = new Map<string, { relationship: string; targetId: string }>();
    for (const link of links) {
      if (!link || typeof link.relationship !== 'string' || typeof link.targetId !== 'string') {
        continue;
      }
      const trimmedRelationship = link.relationship.trim();
      const trimmedTarget = link.targetId.trim();
      if (!trimmedRelationship || !trimmedTarget) {
        continue;
      }
      unique.set(`${trimmedRelationship}:${trimmedTarget}`, {
        relationship: trimmedRelationship,
        targetId: trimmedTarget,
      });
    }
    return Array.from(unique.values());
  }

  async #listLinks(entityId: string): Promise<HardStateLink[]> {
    const result = await this.#pool.query(
      `SELECT e.src_id, e.dst_id, e.type
       FROM edge e
       WHERE e.type IN (SELECT id FROM world_relationship_kind)
         AND (e.src_id = $1::uuid OR e.dst_id = $1::uuid)`,
      [entityId]
    );
    const links: HardStateLink[] = [];
    for (const row of result.rows) {
      if (row.src_id === entityId) {
        links.push({ relationship: row.type, targetId: row.dst_id, direction: 'out' });
      } else {
        links.push({ relationship: row.type, targetId: row.src_id, direction: 'in' });
      }
    }
    return links;
  }

  async #listLinksForMany(entityIds: string[]): Promise<Map<string, HardStateLink[]>> {
    const linkMap = new Map<string, HardStateLink[]>();
    if (entityIds.length === 0) {
      return linkMap;
    }
    const idSet = new Set(entityIds);
    const result = await this.#pool.query(
      `SELECT e.src_id, e.dst_id, e.type
       FROM edge e
       WHERE e.type IN (SELECT id FROM world_relationship_kind)
         AND (e.src_id = ANY($1::uuid[]) OR e.dst_id = ANY($1::uuid[]))`,
      [entityIds]
    );
    for (const row of result.rows) {
      if (idSet.has(row.src_id)) {
        const current = linkMap.get(row.src_id) ?? [];
        current.push({ relationship: row.type, targetId: row.dst_id, direction: 'out' });
        linkMap.set(row.src_id, current);
      }
      if (idSet.has(row.dst_id)) {
        const current = linkMap.get(row.dst_id) ?? [];
        current.push({ relationship: row.type, targetId: row.src_id, direction: 'in' });
        linkMap.set(row.dst_id, current);
      }
    }
    return linkMap;
  }

  async #listNeighbors(input: {
    anchorId: string;
    kind?: HardStateKind;
    minProminence: HardStateProminence;
    maxProminence?: HardStateProminence;
    maxHops?: number;
    limit?: number;
  }): Promise<WorldNeighbor[]> {
    const limit = Math.max(1, Math.min(input.limit ?? 100, 500));
    const maxHops = Math.max(1, Math.min(input.maxHops ?? 2, 2));
    const minRank = PROMINENCE_RANK[input.minProminence] ?? PROMINENCE_RANK.recognized;
    const maxRank = input.maxProminence ? PROMINENCE_RANK[input.maxProminence] : Number.MAX_SAFE_INTEGER;
    const kindFilter = input.kind ?? null;

    const result = await this.#pool.query(
      `WITH base AS (
         SELECT
           CASE WHEN e.src_id = $1::uuid THEN e.dst_id ELSE e.src_id END AS neighbor_id,
           e.type AS root_relationship,
           CASE WHEN e.src_id = $1::uuid THEN 'out' ELSE 'in' END AS root_direction
         FROM edge e
         JOIN hard_state hs ON hs.id = CASE WHEN e.src_id = $1::uuid THEN e.dst_id ELSE e.src_id END
         JOIN world_prominence wp ON wp.id = hs.prominence
         WHERE (e.src_id = $1::uuid OR e.dst_id = $1::uuid)
           AND wp.rank >= $2 AND wp.rank <= $3
           AND ($4::text IS NULL OR hs.kind = $4)
       ),
       second AS (
         SELECT
           b.neighbor_id AS via_id,
           CASE WHEN e.src_id = b.neighbor_id THEN e.dst_id ELSE e.src_id END AS neighbor_id,
           b.root_relationship,
           b.root_direction,
           e.type AS relationship,
           CASE WHEN e.src_id = b.neighbor_id THEN 'out' ELSE 'in' END AS direction
         FROM base b
         JOIN edge e ON e.src_id = b.neighbor_id OR e.dst_id = b.neighbor_id
         JOIN hard_state hs ON hs.id = CASE WHEN e.src_id = b.neighbor_id THEN e.dst_id ELSE e.src_id END
         JOIN world_prominence wp ON wp.id = hs.prominence
         WHERE wp.rank >= $2 AND wp.rank <= $3
           AND CASE WHEN e.src_id = b.neighbor_id THEN e.dst_id ELSE e.src_id END <> $1::uuid
           AND ($4::text IS NULL OR hs.kind = $4)
       ),
       combined AS (
         SELECT
           neighbor_id,
           root_relationship,
           root_direction,
           root_relationship AS relationship,
           root_direction AS direction,
           NULL::uuid AS via_id,
           1 AS hops
         FROM base
         UNION ALL
         SELECT
           neighbor_id,
           root_relationship,
           root_direction,
           relationship,
           direction,
           via_id,
           2 AS hops
         FROM second
       )
       SELECT
         c.neighbor_id,
         c.root_relationship,
         c.root_direction,
         c.relationship,
         c.direction,
         c.via_id,
         c.hops,
         hs.id,
         hs.slug,
         hs.kind,
         hs.subkind,
         hs.name,
         hs.description,
         hs.status,
         hs.prominence,
         hs.created_at,
         hs.updated_at
       FROM combined c
       JOIN hard_state hs ON hs.id = c.neighbor_id
       JOIN world_prominence wp ON wp.id = hs.prominence
       WHERE wp.rank >= $2
         AND wp.rank <= $3
         AND c.hops <= $5
       ORDER BY c.hops ASC, hs.created_at ASC
       LIMIT $6`,
      [input.anchorId, minRank, maxRank, kindFilter, maxHops, limit]
    );

    const seen = new Set<string>();
    const neighbors: WorldNeighbor[] = [];
    for (const row of result.rows) {
      const relationship = row.root_relationship as string;
      const neighborId = row.neighbor_id as string;
      const direction = (row.root_direction as 'out' | 'in') ?? 'out';
      const key = `${relationship}:${neighborId}:${direction}:${row.hops}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      const neighbor: HardState = {
        id: row.id as string,
        slug: row.slug as string,
        kind: row.kind as HardStateKind,
        subkind: row.subkind ?? undefined,
        name: row.name as string,
        description: row.description ?? undefined,
        prominence: row.prominence as HardStateProminence,
        status: row.status ?? undefined,
        links: [],
        createdAt: row.created_at?.getTime?.() ? row.created_at.getTime() : now(),
        updatedAt: row.updated_at?.getTime?.() ? row.updated_at.getTime() : now(),
      };

      neighbors.push({
        direction,
        hops: row.hops as 1 | 2,
        neighbor,
        relationship,
        via: row.via_id
          ? {
              direction: (row.direction as 'out' | 'in') ?? direction,
              id: row.via_id as string,
              relationship: row.relationship as string,
            }
          : undefined,
      });
    }

    return neighbors;
  }

  async #reserveSlug(executor: PoolClient, base: string, id: string): Promise<string> {
    const normalized = base && base.trim().length > 0 ? base.trim() : toSnakeCase(id);
    let candidate = normalized;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const existing = await executor.query(
        `SELECT id FROM hard_state WHERE slug = $1 AND id <> $2::uuid`,
        [candidate, id]
      );
      if (existing.rowCount === 0) {
        return candidate;
      }
      candidate = `${normalized}_${randomUUID().slice(0, 6)}`;
    }
    return `${normalized}_${randomUUID().slice(0, 8)}`;
  }
}

export const createWorldSchemaStore = (options?: {
  pool?: Pool;
  connectionString?: string;
  graph?: GraphOperations;
}): WorldSchemaStore => {
  const pool = options?.pool ?? createPool({ connectionString: options?.connectionString });
  return new PostgresWorldSchemaStore({ pool, graph: options?.graph });
};
