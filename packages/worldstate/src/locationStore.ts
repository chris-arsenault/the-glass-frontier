import type {
  LocationBreadcrumbEntry,
  LocationEdge,
  LocationEdgeKind,
  LocationEvent,
  LocationNeighbors,
  LocationPlace,
  LocationState,
} from '@glass-frontier/dto';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

import { GraphOperations } from './graphOperations';
import { createPool, withTransaction } from './pg';
import type { LocationStore as LocationStoreInterface } from './types';
import { isNonEmptyString, normalizeTags, now, slugify } from './utils';

type Queryable = Pick<Pool, 'query'> | PoolClient;

type LocationRow = {
  id: string;
  slug: string;
  name: string;
  kind: string;
  biome: string | null;
  description: string | null;
  tags: string[];
  metadata: Record<string, unknown> | null;
  created_at: Date | null;
  updated_at: Date | null;
  props?: unknown;
  parent_id?: string | null;
  root_id?: string | null;
};

const toPlace = (row: LocationRow): LocationPlace => {
  const props = (row.props ?? {}) as Partial<LocationPlace>;
  const metadata = props.metadata ?? row.metadata;
  const validMetadata =
    metadata && typeof metadata === 'object' && 'tags' in metadata && 'timestamp' in metadata
      ? (metadata as { tags: string[]; timestamp: number })
      : undefined;
  return {
    canonicalParentId: row.parent_id ?? props.canonicalParentId ?? undefined,
    createdAt:
      typeof props.createdAt === 'number' && Number.isFinite(props.createdAt)
        ? props.createdAt
        : row.created_at?.getTime() ?? now(),
    description: props.description ?? row.description ?? undefined,
    id: row.id,
    kind: props.kind ?? row.kind,
    locationId: row.root_id ?? row.id,
    metadata: validMetadata,
    name: props.name ?? row.name,
    tags: Array.isArray(row.tags) ? row.tags : props.tags ?? [],
    updatedAt:
      typeof props.updatedAt === 'number' && Number.isFinite(props.updatedAt)
        ? props.updatedAt
        : row.updated_at?.getTime() ?? now(),
  };
};

const toNeighbor = (
  row: {
    src_id: string;
    dst_id: string;
    type: LocationEdgeKind;
    props: Record<string, unknown> | null;
    created_at: Date | null;
    neighbor_id: string;
    neighbor_name: string;
    neighbor_kind: string;
    neighbor_slug: string;
    neighbor_description: string | null;
    neighbor_tags: string[];
    neighbor_metadata: Record<string, unknown> | null;
    neighbor_props: Record<string, unknown> | null;
    direction: 'out' | 'in';
  },
  rootId: string
): { edge: LocationEdge; neighbor: LocationPlace; direction: 'out' | 'in' } => {
  const props = (row.props ?? {}) as { metadata?: Record<string, unknown>; createdAt?: number };
  const createdAt =
    typeof props.createdAt === 'number' && Number.isFinite(props.createdAt)
      ? props.createdAt
      : row.created_at?.getTime() ?? now();
  const neighborMetadata = row.neighbor_metadata ?? row.neighbor_props;
  const validNeighborMetadata =
    neighborMetadata && typeof neighborMetadata === 'object' && 'tags' in neighborMetadata && 'timestamp' in neighborMetadata
      ? (neighborMetadata as { tags: string[]; timestamp: number })
      : undefined;
  return {
    direction: row.direction,
    edge: {
      createdAt,
      dst: row.dst_id,
      kind: row.type,
      locationId: rootId,
      metadata: props.metadata,
      src: row.src_id,
    },
    neighbor: {
      canonicalParentId: undefined,
      createdAt: createdAt,
      description: row.neighbor_description ?? undefined,
      id: row.neighbor_id,
      kind: row.neighbor_kind,
      locationId: rootId,
      metadata: validNeighborMetadata,
      name: row.neighbor_name,
      tags: Array.isArray(row.neighbor_tags) ? row.neighbor_tags : [],
      updatedAt: row.created_at?.getTime() ?? createdAt,
    },
  };
};

class PostgresLocationStore implements LocationStoreInterface {
  readonly #pool: Pool;
  readonly #graph: GraphOperations;

  constructor(options: { pool: Pool; graph?: GraphOperations }) {
    this.#pool = options.pool;
    this.#graph = options.graph ?? new GraphOperations(options.pool);
  }

  // --- New API ---
  async upsertLocation(input: {
    id?: string;
    name: string;
    kind: string;
    description?: string | null;
    tags?: string[];
    biome?: string | null;
    parentId?: string | null;
  }): Promise<LocationPlace> {
    const id = input.id ?? randomUUID();
    const tags = normalizeTags(input.tags, 24);
    const slug = await this.#reserveSlug(id, input.name);
    const place = await withTransaction(this.#pool, async (client) => {
      await this.#graph.upsertNode(client, id, 'location', {
        biome: input.biome ?? undefined,
        canonicalParentId: input.parentId ?? undefined,
        description: input.description ?? undefined,
        id,
        kind: input.kind,
        name: input.name,
        tags,
      });
      await client.query(
        `INSERT INTO location (id, slug, name, kind, biome, description, tags, metadata, created_at, updated_at)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::text[], '{}'::jsonb, now(), now())
         ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name,
             kind = EXCLUDED.kind,
             biome = EXCLUDED.biome,
             description = EXCLUDED.description,
             tags = EXCLUDED.tags,
             slug = EXCLUDED.slug,
             updated_at = now()`,
        [id, slug, input.name, input.kind, input.biome ?? null, input.description ?? null, tags]
      );
      await this.#setCanonicalParent(client, id, input.parentId ?? null);
      const fetched = await this.#getPlace(client, id);
      if (!fetched) {
        throw new Error('Failed to upsert location');
      }
      return fetched;
    });
    return place;
  }

  async deleteLocation(input: { id: string }): Promise<void> {
    await withTransaction(this.#pool, async (client) => {
      await client.query('DELETE FROM edge WHERE src_id = $1::uuid OR dst_id = $1::uuid', [input.id]);
      await client.query('DELETE FROM location WHERE id = $1::uuid', [input.id]);
      await this.#graph.deleteNode(client, input.id);
    });
  }

  async createLocationWithRelationship(input: {
    name: string;
    kind: string;
    description?: string | null;
    tags?: string[];
    anchorId: string;
    relationship: 'inside' | 'adjacent' | 'linked';
  }): Promise<LocationPlace> {
    return withTransaction(this.#pool, async (client) => {
      // Determine parent ID based on relationship
      let parentId: string | null = null;

      if (input.relationship === 'inside') {
        // New location is a child of anchor
        parentId = input.anchorId;
      } else if (input.relationship === 'adjacent') {
        // New location is a sibling of anchor - shares anchor's parent
        parentId = await this.#getParentId(client, input.anchorId);
      }

      // Create the new location with parent relationship
      const newPlace = await this.upsertLocation({
        description: input.description,
        kind: input.kind,
        name: input.name,
        parentId,
        tags: input.tags,
      });

      // Create additional edges based on relationship type
      switch (input.relationship) {
        case 'adjacent':
          // Create adjacency edge to anchor
          await this.upsertEdge({
            dst: newPlace.id,
            kind: 'ADJACENT_TO',
            src: input.anchorId,
          });
          break;

        case 'linked':
          // New location is linked to anchor (not in hierarchy)
          await this.upsertEdge({
            dst: newPlace.id,
            kind: 'LINKS_TO',
            src: input.anchorId,
          });
          break;
      }

      // Fetch and return the place with updated relationships
      const result = await this.#getPlace(client, newPlace.id);
      if (!result) {
        throw new Error('Failed to create location with relationship');
      }
      return result;
    });
  }

  async upsertEdge(input: {
    src: string;
    dst: string;
    kind: LocationEdgeKind;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const createdAt = now();
    await this.#pool.query(
      `DELETE FROM edge WHERE src_id = $1::uuid AND dst_id = $2::uuid AND type = $3`,
      [input.src, input.dst, input.kind]
    );
    await this.#pool.query(
      `INSERT INTO edge (id, src_id, dst_id, type, props, created_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::jsonb, to_timestamp($6 / 1000.0))`,
      [
        randomUUID(),
        input.src,
        input.dst,
        input.kind,
        JSON.stringify({ metadata: input.metadata ?? {}, createdAt }),
        createdAt,
      ]
    );
  }

  async deleteEdge(input: { src: string; dst: string; kind: LocationEdgeKind }): Promise<void> {
    await this.#pool.query(
      `DELETE FROM edge WHERE src_id = $1::uuid AND dst_id = $2::uuid AND type = $3`,
      [input.src, input.dst, input.kind]
    );
  }

  async listLocationRoots(input?: { search?: string; limit?: number }): Promise<LocationPlace[]> {
    const limit = Math.max(1, Math.min(100, input?.limit ?? 50));
    const search = input?.search ? `%${input.search.toLowerCase()}%` : null;
    const result = await this.#pool.query(
      `SELECT l.*, NULL::uuid as parent_id, l.id as root_id, n.props
       FROM location l
       JOIN node n ON n.id = l.id
       WHERE NOT EXISTS (
         SELECT 1 FROM edge e WHERE e.src_id = l.id AND e.type = 'location_parent'
       )
       ${search ? 'AND lower(l.name) LIKE $2' : ''}
       ORDER BY l.created_at ASC
       LIMIT $1`,
      search ? [limit, search] : [limit]
    );
    return result.rows.map((row) => toPlace(row as LocationRow));
  }

  async getLocationDetails(input: {
    id: string;
  }): Promise<{
    place: LocationPlace;
    breadcrumb: LocationBreadcrumbEntry[];
    children: LocationPlace[];
    neighbors: LocationNeighbors;
  }> {
    const place = await this.#getPlace(this.#pool, input.id);
    if (!place) {
      throw new Error('Location not found');
    }
    const breadcrumb = await this.getLocationChain({ anchorId: input.id });
    const neighbors = await this.getLocationNeighbors({ id: input.id, limit: 100 });
    const allDescendants = await this.#listDescendants(input.id);
    // Filter out the root itself from descendants to avoid duplication
    const children = allDescendants.filter(desc => desc.id !== input.id);
    return { place, breadcrumb, children, neighbors };
  }


  async getLocationState(characterId: string): Promise<LocationState | null> {
    return this.#getLocationState(this.#pool, characterId);
  }

  async moveCharacterToLocation(input: {
    characterId: string;
    placeId: string;
    certainty?: LocationState['certainty'];
    note?: string | null;
    status?: string[];
  }): Promise<LocationState> {
    const rootId = await this.#resolveRootId(this.#pool, input.placeId);
    await this.#saveCharacterLocation(
      {
        anchorPlaceId: input.placeId,
        certainty: input.certainty ?? 'exact',
        characterId: input.characterId,
        locationId: rootId,
        note: input.note ?? null,
        status: input.status ?? [],
      },
      this.#pool
    );
    return {
      anchorPlaceId: input.placeId,
      certainty: input.certainty ?? 'exact',
      characterId: input.characterId,
      locationId: rootId,
      note: input.note ?? undefined,
      status: input.status ?? [],
      updatedAt: now(),
    };
  }

  async getPlace(placeId: string): Promise<LocationPlace | null> {
    return this.#getPlace(this.#pool, placeId);
  }

  async getLocationChain(input: { anchorId: string }): Promise<LocationBreadcrumbEntry[]> {
    const result = await this.#pool.query(
      `WITH RECURSIVE chain AS (
         SELECT l.id, l.name, l.kind, parent.dst_id AS parent_id
         FROM location l
         LEFT JOIN edge parent ON parent.src_id = l.id AND parent.type = 'location_parent'
         WHERE l.id = $1::uuid
         UNION ALL
         SELECT l.id, l.name, l.kind, parent.dst_id AS parent_id
         FROM chain c
         JOIN location l ON l.id = c.parent_id
         LEFT JOIN edge parent ON parent.src_id = l.id AND parent.type = 'location_parent'
         WHERE c.parent_id IS NOT NULL
       )
       SELECT id, name, kind FROM chain`,
      [input.anchorId]
    );
    return result.rows
      .map((row) => ({ id: row.id as string, kind: row.kind as string, name: row.name as string }))
      .reverse();
  }

  async getLocationNeighbors(input: { id: string; limit?: number }): Promise<LocationNeighbors> {
    const limit = Math.max(1, Math.min(200, input.limit ?? 50));
    const rootId = await this.#resolveRootId(this.#pool, input.id);

    // Query 1: Fetch parent, children, and siblings in a single query
    const hierarchyQuery = this.#pool.query(
      `WITH parent_edge AS (
         -- Find the parent relationship for this location
         SELECT dst_id as parent_id
         FROM edge
         WHERE src_id = $1::uuid AND type = 'location_parent'
         LIMIT 1
       ),
       parent_location AS (
         -- Get parent location details
         SELECT l.*, n.props, 'parent' as relation_type
         FROM parent_edge pe
         JOIN location l ON l.id = pe.parent_id
         JOIN node n ON n.id = l.id
       ),
       children_locations AS (
         -- Get children: locations that have this location as their parent
         SELECT l.*, n.props, 'child' as relation_type
         FROM edge e
         JOIN location l ON l.id = e.src_id
         JOIN node n ON n.id = l.id
         WHERE e.dst_id = $1::uuid AND e.type = 'location_parent'
         ORDER BY l.name ASC
         LIMIT $2
       ),
       sibling_locations AS (
         -- Get siblings: other children of the same parent
         SELECT l.*, n.props, 'sibling' as relation_type
         FROM parent_edge pe
         JOIN edge e ON e.dst_id = pe.parent_id AND e.type = 'location_parent'
         JOIN location l ON l.id = e.src_id
         JOIN node n ON n.id = l.id
         WHERE l.id != $1::uuid
         ORDER BY l.name ASC
         LIMIT $2
       )
       SELECT *, (SELECT parent_id FROM parent_edge) as parent_id FROM parent_location
       UNION ALL
       SELECT *, (SELECT parent_id FROM parent_edge) as parent_id FROM children_locations
       UNION ALL
       SELECT *, (SELECT parent_id FROM parent_edge) as parent_id FROM sibling_locations`,
      [input.id, limit]
    );

    // Query 2: Fetch adjacent/linked neighbors (bidirectional edges)
    const neighborEdgesQuery = this.#pool.query(
      `SELECT e.src_id, e.dst_id, e.type, e.props, e.created_at,
              l.id as neighbor_id, l.name as neighbor_name, l.kind as neighbor_kind, l.slug as neighbor_slug,
              l.description as neighbor_description, l.tags as neighbor_tags, l.metadata as neighbor_metadata,
              n.props as neighbor_props, 'out'::text as direction
       FROM edge e
       JOIN location l ON l.id = e.dst_id
       JOIN node n ON n.id = l.id
       WHERE e.src_id = $1::uuid AND e.type IN ('ADJACENT_TO','CONTAINS','DOCKED_TO','LINKS_TO')
       UNION ALL
       SELECT e.src_id, e.dst_id, e.type, e.props, e.created_at,
              l.id as neighbor_id, l.name as neighbor_name, l.kind as neighbor_kind, l.slug as neighbor_slug,
              l.description as neighbor_description, l.tags as neighbor_tags, l.metadata as neighbor_metadata,
              n.props as neighbor_props, 'in'::text as direction
       FROM edge e
       JOIN location l ON l.id = e.src_id
       JOIN node n ON n.id = l.id
       WHERE e.dst_id = $2::uuid AND e.type IN ('ADJACENT_TO','CONTAINS','DOCKED_TO','LINKS_TO')
       LIMIT $3`,
      [input.id, input.id, limit]
    );

    const [hierarchyRows, edgeRows] = await Promise.all([hierarchyQuery, neighborEdgesQuery]);

    // Parse hierarchy results
    let parentPlace: LocationPlace | null = null;
    const children: LocationPlace[] = [];
    const siblings: LocationPlace[] = [];
    let parentId: string | null = null;

    for (const row of hierarchyRows.rows) {
      const locationRow = row as LocationRow & { relation_type: string; parent_id: string | null };
      parentId = locationRow.parent_id ?? parentId;

      if (locationRow.relation_type === 'parent') {
        parentPlace = toPlace({ ...locationRow, root_id: rootId, parent_id: null });
      } else if (locationRow.relation_type === 'child') {
        children.push(toPlace({ ...locationRow, root_id: rootId, parent_id: input.id }));
      } else if (locationRow.relation_type === 'sibling') {
        siblings.push(toPlace({ ...locationRow, root_id: rootId, parent_id: parentId }));
      }
    }

    // Parse neighbor edges
    const neighbors = edgeRows.rows.map((row) => toNeighbor(row as never, rootId));

    return {
      parent: parentPlace,
      children,
      siblings,
      adjacent: neighbors.filter((entry) => entry.edge.kind === 'ADJACENT_TO'),
      links: neighbors.filter((entry) => entry.edge.kind === 'CONTAINS' || entry.edge.kind === 'LINKS_TO' || entry.edge.kind === 'DOCKED_TO'),
    };
  }

  async appendLocationEvents(input: {
    locationId: string;
    events: Array<{
      chronicleId: string;
      summary: string;
      scope?: string;
      metadata?: Record<string, unknown>;
    }>;
  }): Promise<LocationEvent[]> {
    const createdAt = now();
    const result: LocationEvent[] = [];
    await withTransaction(this.#pool, async (client) => {
      for (const evt of input.events) {
        const id = randomUUID();
        const insert = await client.query(
          `INSERT INTO location_event (id, location_id, chronicle_id, summary, scope, metadata, created_at)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::jsonb, to_timestamp($7 / 1000.0))
           RETURNING id, location_id, chronicle_id, summary, scope, metadata, created_at`,
          [
            id,
            input.locationId,
            evt.chronicleId,
            evt.summary,
            evt.scope ?? null,
            JSON.stringify(evt.metadata ?? {}),
            createdAt,
          ]
        );
        const row = insert.rows[0];
        result.push({
          chronicleId: row.chronicle_id ?? '',
          createdAt: row.created_at?.getTime() ?? createdAt,
          id: row.id,
          locationId: row.location_id,
          metadata: row.metadata ?? undefined,
          scope: row.scope ?? undefined,
          summary: row.summary,
        });
      }
    });
    return result;
  }

  async listLocationEvents(input: { locationId: string }): Promise<LocationEvent[]> {
    const result = await this.#pool.query(
      `SELECT id, location_id, chronicle_id, summary, scope, metadata, created_at
       FROM location_event
       WHERE location_id = $1::uuid
       ORDER BY created_at ASC`,
      [input.locationId]
    );
    return result.rows.map((row) => ({
      chronicleId: row.chronicle_id ?? '',
      createdAt: row.created_at?.getTime() ?? now(),
      id: row.id,
      locationId: row.location_id,
      metadata: row.metadata ?? undefined,
      scope: row.scope ?? undefined,
      summary: row.summary,
    }));
  }

  async #getLocationState(executor: Queryable, characterId: string): Promise<LocationState | null> {
    const result = await executor.query(
      `SELECT dst_id AS anchor_place_id, props
       FROM edge
       WHERE src_id = $1::uuid AND type = 'character_at'
       ORDER BY created_at DESC
       LIMIT 1`,
      [characterId]
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    const anchorPlaceId = row.anchor_place_id as string;
    const props = (row.props ?? {}) as {
      status?: string[];
      certainty?: LocationState['certainty'];
      note?: string | null;
      updatedAt?: number;
      locationId?: string;
    };
    const locationId = props.locationId ?? (await this.#resolveRootId(executor, anchorPlaceId));
    return {
      anchorPlaceId,
      certainty: props.certainty ?? 'exact',
      characterId,
      locationId,
      note: props.note ?? undefined,
      status: Array.isArray(props.status) ? props.status : [],
      updatedAt: props.updatedAt ?? now(),
    };
  }

  async #saveCharacterLocation(
    state: {
      characterId: string;
      anchorPlaceId: string;
      locationId: string;
      status: string[];
      certainty: LocationState['certainty'];
      note?: string | null;
    },
    executor: Queryable = this.#pool
  ): Promise<void> {
    await executor.query(`DELETE FROM edge WHERE src_id = $1::uuid AND type = 'character_at'`, [
      state.characterId,
    ]);
    const createdAt = now();
    await executor.query(
      `INSERT INTO edge (id, src_id, dst_id, type, props, created_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'character_at', $4::jsonb, to_timestamp($5 / 1000.0))`,
      [
        randomUUID(),
        state.characterId,
        state.anchorPlaceId,
        JSON.stringify({
          status: state.status ?? [],
          certainty: state.certainty ?? 'exact',
          note: state.note ?? null,
          locationId: state.locationId,
          updatedAt: createdAt,
        }),
        createdAt,
      ]
    );
  }

  async #listDescendants(rootId: string): Promise<LocationPlace[]> {
    const result = await this.#pool.query(
      `WITH RECURSIVE tree AS (
         SELECT l.*, n.props, NULL::uuid as parent_id, l.id as root_id
         FROM location l
         JOIN node n ON n.id = l.id
         WHERE l.id = $1::uuid
         UNION ALL
         SELECT child.*, n.props, tree.id as parent_id, tree.root_id
         FROM tree
         JOIN edge parent ON parent.dst_id = tree.id AND parent.type = 'location_parent'
         JOIN location child ON child.id = parent.src_id
         JOIN node n ON n.id = child.id
       )
       SELECT * FROM tree`,
      [rootId]
    );
    return result.rows.map((row) => toPlace(row as LocationRow));
  }

  async #getPlace(executor: Queryable, placeId: string): Promise<LocationPlace | null> {
    const result = await executor.query(
      `SELECT l.*, n.props, parent.dst_id AS parent_id
       FROM location l
       JOIN node n ON n.id = l.id
       LEFT JOIN edge parent ON parent.src_id = l.id AND parent.type = 'location_parent'
       WHERE l.id = $1::uuid`,
      [placeId]
    );
    const row = result.rows[0] as LocationRow | undefined;
    if (!row) {
      return null;
    }
    const rootId = await this.#resolveRootId(executor, placeId);
    return toPlace({ ...row, root_id: rootId });
  }

  async #setCanonicalParent(client: PoolClient, placeId: string, parentId: string | null): Promise<void> {
    await client.query('DELETE FROM edge WHERE src_id = $1::uuid AND type = $2', [placeId, 'location_parent']);
    if (isNonEmptyString(parentId)) {
      await client.query(
        `INSERT INTO edge (id, src_id, dst_id, type, props, created_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, 'location_parent', '{}'::jsonb, now())
         ON CONFLICT (src_id, dst_id, type) DO NOTHING`,
        [randomUUID(), placeId, parentId]
      );
    }
  }

  async #resolveRootId(executor: Queryable, placeId: string): Promise<string> {
    let current = placeId;
    const visited = new Set<string>();
    for (let i = 0; i < 64; i += 1) {
      if (visited.has(current)) {
        break;
      }
      visited.add(current);
      const parent = await this.#getParentId(executor, current);
      if (!parent) {
        return current;
      }
      current = parent;
    }
    return current;
  }

  async #getParentId(executor: Queryable, placeId: string): Promise<string | null> {
    const result = await executor.query(
      `SELECT dst_id FROM edge WHERE src_id = $1::uuid AND type = 'location_parent' LIMIT 1`,
      [placeId]
    );
    return result.rows[0]?.dst_id ?? null;
  }

  async #reserveSlug(id: string, name: string): Promise<string> {
    const base = slugify(name);
    let candidate = base;
    for (let i = 0; i < 5; i += 1) {
      const conflict = await this.#pool.query(
        `SELECT 1 FROM location WHERE slug = $1 AND id <> $2::uuid`,
        [candidate, id]
      );
      if (conflict.rowCount === 0) {
        return candidate;
      }
      candidate = `${base}-${randomUUID().slice(0, 4)}`;
    }
    return `${base}-${randomUUID().slice(0, 6)}`;
  }

}

export function createLocationStore(options?: {
  connectionString?: string;
  pool?: Pool;
  graph?: GraphOperations;
}): LocationStoreInterface {
  const pool = createPool({
    connectionString: options?.connectionString,
    pool: options?.pool,
  });
  return new PostgresLocationStore({
    pool,
    graph: options?.graph,
  });
}
