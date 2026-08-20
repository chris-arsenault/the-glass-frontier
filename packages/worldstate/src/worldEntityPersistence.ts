import type {
  HardState,
  HardStateKind,
  HardStateLink,
  HardStateProminence,
  HardStateStatus,
  HardStateSubkind,
} from '@glass-frontier/dto';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

import type { GraphOperations } from './graphOperations';
import { withTransaction } from './pg';
import type { WorldNeighbor } from './types';
import { now, toSnakeCase } from './utils';

export type EntityLinkInput = {
  relationship: string;
  targetId: string;
  strength?: number;
};
export type EntityInput = {
  id?: string;
  kind: HardStateKind;
  subkind?: HardStateSubkind | null;
  name: string;
  description?: string | null;
  prominence?: HardStateProminence | null;
  status?: HardStateStatus | null;
  links?: EntityLinkInput[];
};
export type EntityListInput = {
  kind?: HardStateKind;
  limit?: number;
  minProminence?: HardStateProminence;
  maxProminence?: HardStateProminence;
};

export type NeighborListInput = EntityListInput & {
  id: string;
  maxHops?: number;
};

export type RelationshipInput = {
  srcId: string;
  dstId: string;
  relationship: string;
  strength?: number | null;
};

type KindRow = { default_status: string | null };
type EntityKindRow = { id: string; kind: HardStateKind };
type HardStateRow = {
  id: string;
  slug: string;
  kind: HardStateKind;
  subkind: HardStateSubkind | null;
  name: string;
  description: string | null;
  prominence: HardStateProminence;
  status: HardStateStatus | null;
  created_at: Date | null;
  updated_at: Date | null;
};
type LinkRow = {
  src_id: string;
  dst_id: string;
  type: string;
  strength: number | null;
};
type NeighborRow = HardStateRow & {
  neighbor_id: string;
  root_relationship: string;
  root_direction: 'in' | 'out';
  relationship: string;
  direction: 'in' | 'out';
  via_id: string | null;
  hops: 1 | 2;
};
type EntityWrite = {
  input: EntityInput;
  id: string;
  slug: string;
  status: HardStateStatus | null;
  prominence: HardStateProminence;
  links: EntityLinkInput[];
};

const PROMINENCE_RANK = new Map<HardStateProminence, number>([
  ['forgotten', 0],
  ['marginal', 1],
  ['recognized', 2],
  ['renowned', 3],
  ['mythic', 4],
]);

const ENTITY_SELECT = `SELECT hs.id, hs.slug, hs.kind, hs.subkind, hs.name,
  hs.description, hs.prominence, hs.status, hs.created_at, hs.updated_at
  FROM hard_state hs
  JOIN world_prominence wp ON wp.id = hs.prominence`;

const NEIGHBOR_QUERY = `WITH base AS (
  SELECT CASE WHEN e.src_id = $1::uuid THEN e.dst_id ELSE e.src_id END AS neighbor_id,
    e.type AS root_relationship,
    CASE WHEN e.src_id = $1::uuid THEN 'out' ELSE 'in' END AS root_direction
  FROM edge e
  JOIN hard_state hs ON hs.id = CASE WHEN e.src_id = $1::uuid THEN e.dst_id ELSE e.src_id END
  JOIN world_prominence wp ON wp.id = hs.prominence
  WHERE (e.src_id = $1::uuid OR e.dst_id = $1::uuid)
    AND wp.rank BETWEEN $2 AND $3
    AND ($4::text IS NULL OR hs.kind = $4)
), second AS (
  SELECT b.neighbor_id AS via_id,
    CASE WHEN e.src_id = b.neighbor_id THEN e.dst_id ELSE e.src_id END AS neighbor_id,
    b.root_relationship, b.root_direction, e.type AS relationship,
    CASE WHEN e.src_id = b.neighbor_id THEN 'out' ELSE 'in' END AS direction
  FROM base b
  JOIN edge e ON e.src_id = b.neighbor_id OR e.dst_id = b.neighbor_id
  JOIN hard_state hs ON hs.id = CASE WHEN e.src_id = b.neighbor_id THEN e.dst_id ELSE e.src_id END
  JOIN world_prominence wp ON wp.id = hs.prominence
  WHERE wp.rank BETWEEN $2 AND $3
    AND CASE WHEN e.src_id = b.neighbor_id THEN e.dst_id ELSE e.src_id END <> $1::uuid
    AND ($4::text IS NULL OR hs.kind = $4)
), combined AS (
  SELECT neighbor_id, root_relationship, root_direction,
    root_relationship AS relationship, root_direction AS direction,
    NULL::uuid AS via_id, 1 AS hops FROM base
  UNION ALL
  SELECT neighbor_id, root_relationship, root_direction,
    relationship, direction, via_id, 2 AS hops FROM second
)
SELECT c.neighbor_id, c.root_relationship, c.root_direction, c.relationship,
  c.direction, c.via_id, c.hops, hs.id, hs.slug, hs.kind, hs.subkind,
  hs.name, hs.description, hs.status, hs.prominence, hs.created_at, hs.updated_at
FROM combined c
JOIN hard_state hs ON hs.id = c.neighbor_id
JOIN world_prominence wp ON wp.id = hs.prominence
WHERE wp.rank BETWEEN $2 AND $3 AND c.hops <= $5
ORDER BY c.hops ASC, hs.created_at ASC
LIMIT $6`;

const toHardState = (row: HardStateRow, links: HardStateLink[]): HardState => ({
  createdAt: row.created_at?.getTime() ?? now(),
  description: row.description ?? undefined,
  id: row.id,
  kind: row.kind,
  links,
  name: row.name,
  prominence: row.prominence,
  slug: row.slug,
  status: row.status ?? undefined,
  subkind: row.subkind ?? undefined,
  updatedAt: row.updated_at?.getTime() ?? now(),
});

const toLink = (row: LinkRow, entityId: string): HardStateLink =>
  row.src_id === entityId
    ? {
      direction: 'out', relationship: row.type,
      strength: row.strength ?? undefined, targetId: row.dst_id,
    }
    : {
      direction: 'in', relationship: row.type,
      strength: row.strength ?? undefined, targetId: row.src_id,
    };

const sanitizeLinks = (links?: EntityLinkInput[]): EntityLinkInput[] => {
  if (links === undefined) {
    return [];
  }
  const unique = new Map<string, EntityLinkInput>();
  for (const link of links) {
    const relationship = link.relationship.trim();
    const targetId = link.targetId.trim();
    if (relationship.length === 0 || targetId.length === 0) {
      continue;
    }
    const strength = link.strength === undefined
      ? undefined
      : Math.max(0, Math.min(1, link.strength));
    unique.set(`${relationship}:${targetId}`, { relationship, strength, targetId });
  }
  return [...unique.values()];
};

const getProminenceRank = (value: HardStateProminence): number => {
  const rank = PROMINENCE_RANK.get(value);
  if (rank === undefined) {
    throw new Error(`Invalid prominence value: ${value}`);
  }
  return rank;
};
export class WorldEntityPersistence {
  readonly #pool: Pool;
  readonly #graph: GraphOperations;

  constructor(pool: Pool, graph: GraphOperations) {
    this.#pool = pool;
    this.#graph = graph;
  }

  async upsertEntity(input: EntityInput): Promise<HardState> {
    const id = input.id ?? randomUUID();
    const links = sanitizeLinks(input.links);
    await withTransaction(this.#pool, async (client) => {
      await this.#persistEntity(client, input, id, links);
    });
    const persisted = await this.getEntity({ id });
    if (persisted === null) {
      throw new Error('Failed to upsert entity');
    }
    return persisted;
  }

  async deleteEntity(input: { id: string }): Promise<void> {
    await withTransaction(this.#pool, async (client) => {
      await client.query(
        `DELETE FROM edge WHERE type IN (SELECT id FROM world_relationship_kind)
         AND (src_id = $1::uuid OR dst_id = $1::uuid)`, [input.id]
      );
      await client.query('DELETE FROM hard_state WHERE id = $1::uuid', [input.id]);
      await this.#graph.deleteNode(client, input.id);
    });
  }

  async upsertRelationship(input: RelationshipInput): Promise<void> {
    await withTransaction(this.#pool, async (client) => {
      await this.#assertRelationshipAllowed(client, input);
      await this.#graph.upsertEdge(client, {
        dst: input.dstId, props: {}, src: input.srcId,
        strength: input.strength ?? null, type: input.relationship,
      });
    });
  }

  async deleteRelationship(input: Omit<RelationshipInput, 'strength'>): Promise<void> {
    await this.#pool.query(
      'DELETE FROM edge WHERE src_id = $1::uuid AND dst_id = $2::uuid AND type = $3',
      [input.srcId, input.dstId, input.relationship]
    );
  }

  async getEntity(input: { id: string }): Promise<HardState | null> {
    const result = await this.#pool.query<HardStateRow>(
      `${ENTITY_SELECT} WHERE hs.id = $1::uuid`, [input.id]
    );
    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }
    return toHardState(row, await this.#listLinks(row.id));
  }

  async getEntityBySlug(input: { slug: string }): Promise<HardState | null> {
    const result = await this.#pool.query<HardStateRow>(
      `${ENTITY_SELECT} WHERE hs.slug = $1`, [input.slug]
    );
    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }
    return toHardState(row, await this.#listLinks(row.id));
  }

  async listEntities(input?: EntityListInput): Promise<HardState[]> {
    const { clauses, params } = this.#buildEntityFilters(input);
    const filter = clauses.length === 0 ? '' : `WHERE ${clauses.join(' AND ')}`;
    const result = await this.#pool.query<HardStateRow>(
      `${ENTITY_SELECT} ${filter} ORDER BY wp.rank ASC, hs.created_at ASC LIMIT $1`, params
    );
    const links = await this.#listLinksForMany(result.rows.map((row) => row.id));
    return result.rows.map((row) => toHardState(row, links.get(row.id) ?? []));
  }

  async listNeighbors(input: NeighborListInput): Promise<WorldNeighbor[]> {
    const minRank = getProminenceRank(input.minProminence ?? 'recognized');
    const maxRank = getProminenceRank(input.maxProminence ?? 'mythic');
    const maxHops = Math.max(1, Math.min(input.maxHops ?? 2, 2));
    const limit = Math.max(1, Math.min(input.limit ?? 100, 500));
    const result = await this.#pool.query<NeighborRow>(NEIGHBOR_QUERY, [
      input.id, minRank, maxRank, input.kind ?? null, maxHops, limit,
    ]);
    const seen = new Set<string>();
    return result.rows.flatMap((row) => {
      const key = `${row.root_relationship}:${row.neighbor_id}:${row.root_direction}:${row.hops}`;
      if (seen.has(key)) {
        return [];
      }
      seen.add(key);
      return [this.#toNeighbor(row)];
    });
  }

  async #persistEntity(
    client: PoolClient, input: EntityInput, id: string, links: EntityLinkInput[]
  ): Promise<void> {
    const kind = await this.#getKind(client, input.kind);
    const status = await this.#resolveStatus(client, input.kind, input.status ?? kind.default_status);
    const prominence = input.prominence ?? 'recognized';
    await Promise.all([
      this.#assertSubkind(client, input.kind, input.subkind ?? null),
      this.#assertProminence(client, prominence),
    ]);
    const slug = await this.#reserveSlug(client, toSnakeCase(input.name), id);
    await this.#writeEntity(client, { id, input, links, prominence, slug, status });
    if (input.links !== undefined) {
      await this.#syncRelationships(client, id, links);
    }
  }

  async #writeEntity(client: PoolClient, write: EntityWrite): Promise<void> {
    const { id, input, links, prominence, slug, status } = write;
    const description = input.description?.trim() ?? null;
    const subkind = input.subkind ?? null;
    await this.#graph.upsertNode(client, id, 'world_entity', {
      description: description ?? undefined, id, kind: input.kind, links,
      name: input.name, prominence, slug, status: status ?? undefined,
      subkind: subkind ?? undefined,
    });
    await client.query(
      `INSERT INTO hard_state
       (id, slug, kind, subkind, name, description, prominence, status, created_at, updated_at)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, now(), now())
       ON CONFLICT (id) DO UPDATE SET slug = EXCLUDED.slug, kind = EXCLUDED.kind,
       subkind = EXCLUDED.subkind, name = EXCLUDED.name,
       description = EXCLUDED.description, prominence = EXCLUDED.prominence,
       status = EXCLUDED.status, updated_at = now()`,
      [id, slug, input.kind, subkind, input.name, description, prominence, status]
    );
  }

  #buildEntityFilters(input?: EntityListInput): {
    clauses: string[]; params: Array<string | number>;
  } {
    const params: Array<string | number> = [Math.max(1, Math.min(200, input?.limit ?? 100))];
    const clauses: string[] = [];
    if (input?.kind !== undefined) {
      params.push(input.kind);
      clauses.push(`hs.kind = $${params.length}`);
    }
    if (input?.minProminence !== undefined) {
      params.push(getProminenceRank(input.minProminence));
      clauses.push(`wp.rank >= $${params.length}`);
    }
    if (input?.maxProminence !== undefined) {
      params.push(getProminenceRank(input.maxProminence));
      clauses.push(`wp.rank <= $${params.length}`);
    }
    return { clauses, params };
  }

  async #getKind(client: PoolClient, kind: HardStateKind): Promise<KindRow> {
    const result = await client.query<KindRow>(
      'SELECT default_status FROM world_kind WHERE id = $1', [kind]
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error(`Hard state kind ${kind} is not configured`);
    }
    return row;
  }

  async #resolveStatus(
    client: PoolClient, kind: HardStateKind, status: string | null
  ): Promise<HardStateStatus | null> {
    if (status === null) {
      return null;
    }
    const result = await client.query(
      'SELECT 1 FROM world_kind_status WHERE kind_id = $1 AND status = $2', [kind, status]
    );
    if (result.rowCount === 0) {
      throw new Error(`Status ${status} is not allowed for kind ${kind}`);
    }
    return status as HardStateStatus;
  }

  async #assertSubkind(
    client: PoolClient, kind: HardStateKind, subkind: string | null
  ): Promise<void> {
    if (subkind === null) {
      return;
    }
    const result = await client.query(
      'SELECT 1 FROM world_subkind WHERE id = $1 AND kind_id = $2', [subkind, kind]
    );
    if (result.rowCount === 0) {
      throw new Error(`Subkind ${subkind} is not allowed for kind ${kind}`);
    }
  }

  async #assertProminence(client: PoolClient, value: HardStateProminence): Promise<void> {
    const result = await client.query('SELECT 1 FROM world_prominence WHERE id = $1', [value]);
    if (result.rowCount === 0) {
      throw new Error(`Invalid prominence value: ${value}`);
    }
  }

  async #syncRelationships(
    client: PoolClient, entityId: string, links: EntityLinkInput[]
  ): Promise<void> {
    await client.query(
      `DELETE FROM edge WHERE type IN (SELECT id FROM world_relationship_kind)
       AND (src_id = $1::uuid OR dst_id = $1::uuid)`, [entityId]
    );
    await Promise.all(links.map(async (link) => {
      const relationship = { dstId: link.targetId, relationship: link.relationship, srcId: entityId };
      await this.#assertRelationshipAllowed(client, relationship);
      await this.#graph.upsertEdge(client, {
        dst: link.targetId, props: {}, src: entityId,
        strength: link.strength ?? null, type: link.relationship,
      });
    }));
  }

  async #assertRelationshipAllowed(
    client: PoolClient, input: Omit<RelationshipInput, 'strength'>
  ): Promise<void> {
    const result = await client.query<EntityKindRow>(
      'SELECT id, kind FROM hard_state WHERE id = ANY($1::uuid[])',
      [[input.srcId, input.dstId]]
    );
    const srcKind = result.rows.find((row) => row.id === input.srcId)?.kind;
    const dstKind = result.rows.find((row) => row.id === input.dstId)?.kind;
    if (srcKind === undefined || dstKind === undefined) {
      throw new Error('Relationship targets must both be hard state entities');
    }
    const rule = await client.query(
      `SELECT 1 FROM world_relationship_rule
       WHERE relationship_id = $1 AND src_kind = $2 AND dst_kind = $3`,
      [input.relationship, srcKind, dstKind]
    );
    if (rule.rowCount === 0) {
      throw new Error(`Relationship ${input.relationship} is not allowed between ${srcKind} and ${dstKind}`);
    }
  }

  async #listLinks(entityId: string): Promise<HardStateLink[]> {
    const result = await this.#pool.query<LinkRow>(
      `SELECT e.src_id, e.dst_id, e.type, e.strength FROM edge e
       WHERE e.type IN (SELECT id FROM world_relationship_kind)
       AND (e.src_id = $1::uuid OR e.dst_id = $1::uuid)`, [entityId]
    );
    return result.rows.map((row) => toLink(row, entityId));
  }

  async #listLinksForMany(entityIds: string[]): Promise<Map<string, HardStateLink[]>> {
    const linkMap = new Map<string, HardStateLink[]>();
    if (entityIds.length === 0) {
      return linkMap;
    }
    const idSet = new Set(entityIds);
    const result = await this.#pool.query<LinkRow>(
      `SELECT e.src_id, e.dst_id, e.type, e.strength FROM edge e
       WHERE e.type IN (SELECT id FROM world_relationship_kind)
       AND (e.src_id = ANY($1::uuid[]) OR e.dst_id = ANY($1::uuid[]))`, [entityIds]
    );
    for (const row of result.rows) {
      this.#addLink(linkMap, idSet, row.src_id, toLink(row, row.src_id));
      this.#addLink(linkMap, idSet, row.dst_id, toLink(row, row.dst_id));
    }
    return linkMap;
  }

  #addLink(
    links: Map<string, HardStateLink[]>, entityIds: Set<string>,
    entityId: string, link: HardStateLink
  ): void {
    if (!entityIds.has(entityId)) {
      return;
    }
    links.set(entityId, [...(links.get(entityId) ?? []), link]);
  }

  #toNeighbor(row: NeighborRow): WorldNeighbor {
    return {
      direction: row.root_direction, hops: row.hops,
      neighbor: toHardState(row, []), relationship: row.root_relationship,
      via: row.via_id === null ? undefined : {
        direction: row.direction, id: row.via_id, relationship: row.relationship,
      },
    };
  }

  async #reserveSlug(client: PoolClient, base: string, id: string): Promise<string> {
    const normalized = base.trim().length > 0 ? base.trim() : toSnakeCase(id);
    const candidates = [
      normalized,
      ...Array.from({ length: 4 }, () => `${normalized}_${randomUUID().slice(0, 6)}`),
    ];
    const result = await client.query<{ slug: string }>(
      'SELECT slug FROM hard_state WHERE slug = ANY($1::text[]) AND id <> $2::uuid',
      [candidates, id]
    );
    const occupied = new Set(result.rows.map((row) => row.slug));
    return candidates.find((candidate) => !occupied.has(candidate))
      ?? `${normalized}_${randomUUID().slice(0, 8)}`;
  }
}
