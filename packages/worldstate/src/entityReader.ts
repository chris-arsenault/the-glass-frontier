import type {
  CanonSource,
  HardState,
  HardStateKind,
  HardStateLink,
  HardStateLinkProps,
  HardStateProminence,
  HardStateStatus,
  HardStateSubkind,
  PlayableRole,
  RouteGeometry,
  SpatialPosition,
} from '@glass-frontier/dto';
import type { Pool } from 'pg';

import type { WorldNeighbor } from './types';
import { now } from './utils';

export type EntityListInput = {
  dm?: boolean;
  isArticle?: boolean;
  kind?: HardStateKind;
  /** Only entities that are (or are not) location-shaped. */
  isLocation?: boolean;
  limit?: number;
  minProminence?: HardStateProminence;
  maxProminence?: HardStateProminence;
  playableAs?: PlayableRole;
};

export type NeighborListInput = EntityListInput & {
  id: string;
  maxHops?: number;
};

export type EntityStats = {
  id: string;
  source: CanonSource;
  loreCount: number;
  edgeCount: number;
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
  props: {
    facts?: Record<string, string | number>;
    positions?: SpatialPosition[];
    routeGeometry?: RouteGeometry;
  } | null;
  external_key: string | null;
  dm: boolean;
  is_article: boolean;
  is_location: boolean;
  origin_blurb: string | null;
  playable_as: PlayableRole[];
  veiled: boolean;
  veil_tagline: string | null;
  created_at: Date | null;
  updated_at: Date | null;
};
type LinkRow = {
  src_id: string;
  dst_id: string;
  type: HardStateLink['relationship'];
  strength: number | null;
  props:
    | ({ live?: boolean; since?: number; until?: number } & Record<
        string,
        string | number | boolean | undefined
      >)
    | null;
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
  e.description, e.prominence, e.status, e.props, e.external_key, e.dm, e.is_article,
  e.is_location, e.origin_blurb, e.playable_as, e.veiled, e.veil_tagline,
  e.created_at, e.updated_at
  FROM entity e
  JOIN world_prominence wp ON wp.id = e.prominence`;

const FOCUS_EXCLUDED_RELATIONSHIPS = [
  'active_during',
  'created_during',
  'disappeared_during',
  'emerged_during',
  'mentions',
] as const;

const FOCUS_CHOICE_QUERY = `${ENTITY_SELECT}
  WHERE e.id IN (
    SELECT CASE WHEN edge.src_id = $1::uuid THEN edge.dst_id ELSE edge.src_id END
    FROM edge
    WHERE (edge.src_id = $1::uuid OR edge.dst_id = $1::uuid)
      AND COALESCE((edge.props ->> 'live')::boolean, true)
      AND NOT (edge.type = ANY($2::text[]))
  )
    AND NOT e.dm
    AND NOT e.is_article
    AND NOT e.is_location
    AND e.status IS DISTINCT FROM 'shell'
  ORDER BY wp.rank ASC, e.created_at ASC`;

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
  JOIN entity root ON root.id = $1::uuid AND NOT root.is_article
  JOIN world_relationship_kind wrk ON wrk.id = e.type AND wrk.category <> 'banned'
  JOIN entity neighbor ON neighbor.id = CASE
    WHEN e.src_id = $1::uuid THEN e.dst_id ELSE e.src_id END
    AND NOT neighbor.is_article
  WHERE (e.src_id = $1::uuid OR e.dst_id = $1::uuid)
    AND COALESCE((e.props ->> 'live')::boolean, true)
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
  JOIN entity next_entity ON next_entity.id = CASE
    WHEN e.src_id = w.neighbor_id THEN e.dst_id ELSE e.src_id END
    AND NOT next_entity.is_article
  WHERE w.hops < $5
    AND COALESCE((e.props ->> 'live')::boolean, true)
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
  e.name, e.description, e.status, e.prominence, e.props, e.external_key, e.dm,
  e.is_article, e.is_location, e.origin_blurb, e.playable_as, e.veiled, e.veil_tagline,
  e.created_at, e.updated_at
FROM ranked r
JOIN entity e ON e.id = r.neighbor_id
JOIN world_prominence wp ON wp.id = e.prominence
WHERE wp.rank BETWEEN $2 AND $3
  AND ($4::text IS NULL OR e.kind = $4)
ORDER BY r.reach DESC, r.hops ASC, e.created_at ASC
LIMIT $6`;

const optional = <Value>(value: Value | null): Value | undefined => value ?? undefined;

const rowFacts = (row: EntityRow): Record<string, string | number> => row.props?.facts ?? {};

const rowTimestamp = (value: Date | null): number => value?.getTime() ?? now();

const toEntity = (row: EntityRow, links: HardStateLink[]): HardState => ({
  createdAt: rowTimestamp(row.created_at),
  description: optional(row.description),
  dm: row.dm,
  externalKey: optional(row.external_key),
  facts: rowFacts(row),
  id: row.id,
  isArticle: row.is_article,
  isLocation: row.is_location,
  kind: row.kind,
  links,
  name: row.name,
  originBlurb: optional(row.origin_blurb),
  playableAs: row.playable_as,
  positions: row.props?.positions ?? [],
  prominence: row.prominence,
  routeGeometry: row.props?.routeGeometry,
  slug: row.slug,
  status: optional(row.status),
  subkind: optional(row.subkind),
  updatedAt: rowTimestamp(row.updated_at),
  veiled: row.veiled,
  veilTagline: optional(row.veil_tagline),
});

/** Edge props minus the temporal envelope: the relation's typed properties. */
const LINK_ENVELOPE_KEYS = new Set(['live', 'since', 'until']);
const linkProps = (row: LinkRow): HardStateLinkProps | undefined => {
  if (row.props === null) {
    return undefined;
  }
  const entries = Object.entries(row.props).filter(
    (entry): entry is [string, string | number | boolean] =>
      !LINK_ENVELOPE_KEYS.has(entry[0]) && entry[1] !== undefined
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const linkDetails = (row: LinkRow): Omit<HardStateLink, 'direction' | 'relationship' | 'targetId'> => ({
  live: row.props?.live ?? true,
  props: linkProps(row),
  since: row.props?.since,
  strength: optional(row.strength),
  until: row.props?.until,
});

const toLink = (row: LinkRow, entityId: string): HardStateLink => ({
  ...linkDetails(row),
  direction: row.src_id === entityId ? 'out' : 'in',
  relationship: row.type,
  targetId: row.src_id === entityId ? row.dst_id : row.src_id,
});

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
       WHERE e.is_location AND NOT e.dm AND lower(e.name) = lower($1)
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

  /**
   * Every entity whose display name matches, case-insensitively, most
   * prominent first. Closure-time dedup: a candidate new entity that matches
   * an existing name becomes an append to that entity, not a second node.
   */
  async findEntitiesByName(input: { name: string }): Promise<HardState[]> {
    const result = await this.#pool.query<EntityRow>(
      `${ENTITY_SELECT}
       WHERE lower(e.name) = lower($1)
       ORDER BY wp.rank DESC, e.created_at ASC`,
      [input.name.trim()]
    );
    const links = await this.#listLinksForMany(result.rows.map((row) => row.id));
    return result.rows.map((row) => toEntity(row, links.get(row.id) ?? []));
  }

  /** Provenance plus accumulation counts, for derived description and prominence. */
  async listEntityStats(ids: string[]): Promise<EntityStats[]> {
    if (ids.length === 0) {
      return [];
    }
    const result = await this.#pool.query<{
      id: string;
      source: CanonSource;
      lore_count: string;
      edge_count: string;
    }>(
      `SELECT e.id, e.source,
         (SELECT count(*) FROM lore_fragment lf WHERE lf.entity_id = e.id) AS lore_count,
         (SELECT count(*) FROM edge ed WHERE ed.src_id = e.id OR ed.dst_id = e.id) AS edge_count
       FROM entity e
       WHERE e.id = ANY($1::uuid[])`,
      [ids]
    );
    return result.rows.map((row) => ({
      edgeCount: Number(row.edge_count),
      id: row.id,
      loreCount: Number(row.lore_count),
      source: row.source,
    }));
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

  async listFocusChoices(input: { locationId: string }): Promise<HardState[]> {
    const result = await this.#pool.query<EntityRow>(FOCUS_CHOICE_QUERY, [
      input.locationId,
      FOCUS_EXCLUDED_RELATIONSHIPS,
    ]);
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
    const {
      dm,
      isArticle,
      isLocation,
      kind,
      limit,
      maxProminence,
      minProminence,
      playableAs,
    } = input;
    const params: Array<string | number | boolean> = [
      Math.max(1, Math.min(200, limit ?? 100)),
    ];
    const clauses: string[] = [];
    const filters: Array<[string, string | number | boolean | undefined]> = [
      ['e.dm =', dm],
      ['e.is_article =', isArticle],
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
    if (playableAs !== undefined) {
      params.push(playableAs);
      clauses.push(`e.playable_as @> ARRAY[$${params.length}]::text[]`);
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
