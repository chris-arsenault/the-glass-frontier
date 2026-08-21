import type {
  HardState,
  HardStateKind,
  HardStateLink,
  HardStateProminence,
  HardStateStatus,
  HardStateSubkind,
} from '@glass-frontier/dto';
import type { Pool } from 'pg';

import type { WorldNeighbor } from './types';
import { now } from './utils';

export type EntityListInput = {
  kind?: HardStateKind;
  /** Only entities that are (or are not) location-shaped. */
  isLocation?: boolean;
  limit?: number;
  minProminence?: HardStateProminence;
  maxProminence?: HardStateProminence;
};

export type NeighborListInput = EntityListInput & {
  id: string;
  maxHops?: number;
};

type EntityRow = {
  id: string;
  slug: string;
  kind: HardStateKind;
  subkind: HardStateSubkind | null;
  name: string;
  description: string | null;
  prominence: HardStateProminence;
  status: HardStateStatus | null;
  props: { facts?: Record<string, string | number> } | null;
  is_location: boolean;
  created_at: Date | null;
  updated_at: Date | null;
};
type LinkRow = {
  src_id: string;
  dst_id: string;
  type: HardStateLink['relationship'];
  strength: number | null;
  props: { since?: number; until?: number } | null;
};
type NeighborRow = EntityRow & {
  neighbor_id: string;
  root_relationship: string;
  root_direction: 'in' | 'out';
  relationship: string;
  direction: 'in' | 'out';
  via_id: string | null;
  hops: number;
};

const PROMINENCE_RANK = new Map<HardStateProminence, number>([
  ['forgotten', 0],
  ['marginal', 1],
  ['recognized', 2],
  ['renowned', 3],
  ['mythic', 4],
]);

const ENTITY_SELECT = `SELECT e.id, e.slug, e.kind, e.subkind, e.name,
  e.description, e.prominence, e.status, e.props, e.is_location,
  e.created_at, e.updated_at
  FROM entity e
  JOIN world_prominence wp ON wp.id = e.prominence`;

/**
 * Depth-bounded traversal weighted by relationship strength.
 *
 * Every step multiplies the running strength by
 * `COALESCE(edge.strength, world_relationship_kind.default_strength)`, so a path
 * through `leader_of` reaches further than one through `adjacent_to`, and the
 * strongest route to each neighbor wins. Depth is a parameter rather than two
 * hand-written CTE levels, and banned verbs never carry a path.
 */
const NEIGHBOR_QUERY = `WITH RECURSIVE walk AS (
  SELECT
    CASE WHEN e.src_id = $1::uuid THEN e.dst_id ELSE e.src_id END AS neighbor_id,
    e.type AS root_relationship,
    CASE WHEN e.src_id = $1::uuid THEN 'out' ELSE 'in' END AS root_direction,
    e.type AS relationship,
    CASE WHEN e.src_id = $1::uuid THEN 'out' ELSE 'in' END AS direction,
    NULL::uuid AS via_id,
    1 AS hops,
    COALESCE(e.strength, wrk.default_strength)::real AS reach
  FROM edge e
  JOIN world_relationship_kind wrk ON wrk.id = e.type AND wrk.category <> 'banned'
  WHERE e.src_id = $1::uuid OR e.dst_id = $1::uuid
  UNION ALL
  SELECT
    CASE WHEN e.src_id = w.neighbor_id THEN e.dst_id ELSE e.src_id END,
    w.root_relationship, w.root_direction,
    e.type,
    CASE WHEN e.src_id = w.neighbor_id THEN 'out' ELSE 'in' END,
    w.neighbor_id,
    w.hops + 1,
    (w.reach * COALESCE(e.strength, wrk.default_strength))::real
  FROM walk w
  JOIN edge e ON e.src_id = w.neighbor_id OR e.dst_id = w.neighbor_id
  JOIN world_relationship_kind wrk ON wrk.id = e.type AND wrk.category <> 'banned'
  WHERE w.hops < $5
    AND CASE WHEN e.src_id = w.neighbor_id THEN e.dst_id ELSE e.src_id END <> $1::uuid
), ranked AS (
  SELECT DISTINCT ON (neighbor_id, root_relationship, root_direction)
    neighbor_id, root_relationship, root_direction, relationship, direction,
    via_id, hops, reach
  FROM walk
  ORDER BY neighbor_id, root_relationship, root_direction, reach DESC, hops ASC
)
SELECT r.neighbor_id, r.root_relationship, r.root_direction, r.relationship,
  r.direction, r.via_id, r.hops, e.id, e.slug, e.kind, e.subkind,
  e.name, e.description, e.status, e.prominence, e.created_at, e.updated_at
FROM ranked r
JOIN entity e ON e.id = r.neighbor_id
JOIN world_prominence wp ON wp.id = e.prominence
WHERE wp.rank BETWEEN $2 AND $3
  AND ($4::text IS NULL OR e.kind = $4)
ORDER BY r.reach DESC, r.hops ASC, e.created_at ASC
LIMIT $6`;

const toEntity = (row: EntityRow, links: HardStateLink[]): HardState => ({
  createdAt: row.created_at?.getTime() ?? now(),
  description: row.description ?? undefined,
  facts: row.props?.facts ?? {},
  id: row.id,
  isLocation: row.is_location,
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
      since: row.props?.since, strength: row.strength ?? undefined,
      targetId: row.dst_id, until: row.props?.until,
    }
    : {
      direction: 'in', relationship: row.type,
      since: row.props?.since, strength: row.strength ?? undefined,
      targetId: row.src_id, until: row.props?.until,
    };

const getProminenceRank = (value: HardStateProminence): number => {
  const rank = PROMINENCE_RANK.get(value);
  if (rank === undefined) {
    throw new Error(`Invalid prominence value: ${value}`);
  }
  return rank;
};

/**
 * Read access to canon entities. Writes go through `CanonWriter.commitBatch`;
 * there is deliberately no per-entity mutation here.
 */
export class EntityReader {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async getEntity(input: { id: string }): Promise<HardState | null> {
    const result = await this.#pool.query<EntityRow>(
      `${ENTITY_SELECT} WHERE e.id = $1::uuid`, [input.id]
    );
    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }
    return toEntity(row, await this.#listLinks(row.id));
  }

  async getEntityBySlug(input: { slug: string }): Promise<HardState | null> {
    const result = await this.#pool.query<EntityRow>(
      `${ENTITY_SELECT} WHERE e.slug = $1`, [input.slug]
    );
    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }
    return toEntity(row, await this.#listLinks(row.id));
  }

  /**
   * Resolves a place by its display name, case-insensitively, across every
   * location-shaped entity regardless of kind. Play tracks where a chronicle
   * is as a name; when that name matches canon, retrieval can seed from the
   * place itself. The most prominent match wins.
   */
  async findLocationByName(input: { name: string }): Promise<HardState | null> {
    const result = await this.#pool.query<EntityRow>(
      `${ENTITY_SELECT}
       WHERE e.is_location AND lower(e.name) = lower($1)
       ORDER BY wp.rank DESC, e.created_at ASC
       LIMIT 1`,
      [input.name.trim()]
    );
    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }
    return toEntity(row, await this.#listLinks(row.id));
  }

  async listEntities(input?: EntityListInput): Promise<HardState[]> {
    const { clauses, params } = this.#buildEntityFilters(input);
    const filter = clauses.length === 0 ? '' : `WHERE ${clauses.join(' AND ')}`;
    const result = await this.#pool.query<EntityRow>(
      `${ENTITY_SELECT} ${filter} ORDER BY wp.rank ASC, e.created_at ASC LIMIT $1`, params
    );
    const links = await this.#listLinksForMany(result.rows.map((row) => row.id));
    return result.rows.map((row) => toEntity(row, links.get(row.id) ?? []));
  }

  async listEntitiesByIds(ids: string[]): Promise<HardState[]> {
    if (ids.length === 0) {
      return [];
    }
    const result = await this.#pool.query<EntityRow>(
      `${ENTITY_SELECT} WHERE e.id = ANY($1::uuid[])`, [ids]
    );
    const links = await this.#listLinksForMany(result.rows.map((row) => row.id));
    return result.rows.map((row) => toEntity(row, links.get(row.id) ?? []));
  }

  async listNeighbors(input: NeighborListInput): Promise<WorldNeighbor[]> {
    const minRank = getProminenceRank(input.minProminence ?? 'recognized');
    const maxRank = getProminenceRank(input.maxProminence ?? 'mythic');
    const maxHops = Math.max(1, Math.min(input.maxHops ?? 2, 4));
    const limit = Math.max(1, Math.min(input.limit ?? 100, 500));
    const result = await this.#pool.query<NeighborRow>(NEIGHBOR_QUERY, [
      input.id, minRank, maxRank, input.kind ?? null, maxHops, limit,
    ]);
    return result.rows.map((row) => this.#toNeighbor(row));
  }

  #buildEntityFilters(input: EntityListInput = {}): {
    clauses: string[]; params: Array<string | number | boolean>;
  } {
    const { isLocation, kind, limit, maxProminence, minProminence } = input;
    const params: Array<string | number | boolean> = [
      Math.max(1, Math.min(200, limit ?? 100)),
    ];
    const clauses: string[] = [];
    const filters: Array<[string, string | number | boolean | undefined]> = [
      ['e.kind =', kind],
      ['e.is_location =', isLocation],
      ['wp.rank >=', minProminence === undefined ? undefined : getProminenceRank(minProminence)],
      ['wp.rank <=', maxProminence === undefined ? undefined : getProminenceRank(maxProminence)],
    ];
    for (const [comparison, value] of filters) {
      if (value !== undefined) {
        params.push(value);
        clauses.push(`${comparison} $${params.length}`);
      }
    }
    return { clauses, params };
  }

  async #listLinks(entityId: string): Promise<HardStateLink[]> {
    const result = await this.#pool.query<LinkRow>(
      `SELECT e.src_id, e.dst_id, e.type, e.strength, e.props FROM edge e
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
      `SELECT e.src_id, e.dst_id, e.type, e.strength, e.props FROM edge e
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
      neighbor: toEntity(row, []), relationship: row.root_relationship,
      via: row.via_id === null ? undefined : {
        direction: row.direction, id: row.via_id, relationship: row.relationship,
      },
    };
  }
}
