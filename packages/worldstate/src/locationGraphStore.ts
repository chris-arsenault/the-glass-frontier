/* eslint-disable max-lines, max-lines-per-function, complexity, no-await-in-loop, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/strict-boolean-expressions, perfectionistPlugin/sort-objects */
import type {
  LocationEdge,
  LocationEdgeKind,
  LocationEvent,
  LocationGraphSnapshot,
  LocationPlace,
  LocationPlan,
  LocationPlanEdge,
  LocationState,
  LocationSummary,
} from '@glass-frontier/dto';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

import { executeLocationPlan, type PlanExecutionResult, type PlanMutationAdapter } from './locationGraphPlan';
import { createPool, withTransaction } from './pg';
import type { LocationGraphStore } from './types';
import { coerceString, isNonEmptyString, normalizeTags, now, slugify } from './utils';

type Queryable = Pick<Pool, 'query'> | PoolClient;

type LocationRow = {
  id: string;
  slug: string;
  name: string;
  kind: string;
  location_root: string;
  canonical_parent: string | null;
  description: string | null;
  tags: string[];
  ltree_path: string | null;
  created_at: Date | null;
  updated_at: Date | null;
  props?: unknown;
};

type LocationStateRow = {
  character_id: string;
  location_id: string;
  anchor_place_id: string;
  certainty: LocationState['certainty'];
  status: string[];
  note: string | null;
  updated_at: Date | null;
};

const toPlace = (row: LocationRow): LocationPlace => {
  const props = (row.props ?? {}) as Partial<LocationPlace>;
  return {
    canonicalParentId: row.canonical_parent ?? props.canonicalParentId ?? undefined,
    createdAt: Number.isFinite(props.createdAt) && typeof props.createdAt === 'number'
      ? props.createdAt
      : row.created_at?.getTime() ?? now(),
    description: props.description ?? row.description ?? undefined,
    id: row.id,
    kind: props.kind ?? row.kind,
    locationId: row.location_root,
    metadata: props.metadata ?? undefined,
    name: props.name ?? row.name,
    tags: Array.isArray(row.tags) ? row.tags : props.tags ?? [],
    updatedAt: Number.isFinite(props.updatedAt) && typeof props.updatedAt === 'number'
      ? props.updatedAt
      : row.updated_at?.getTime() ?? now(),
  };
};

const toEdge = (row: {
  src_id: string;
  dst_id: string;
  type: LocationEdgeKind;
  props: Record<string, unknown> | null;
  created_at?: Date | null;
}): LocationEdge => {
  const props = (row.props ?? {}) as { metadata?: Record<string, unknown>; createdAt?: unknown; locationId?: string };
  const createdAt =
    typeof props.createdAt === 'number' && Number.isFinite(props.createdAt)
      ? props.createdAt
      : row.created_at?.getTime() ?? now();
  return {
    createdAt,
    dst: row.dst_id,
    kind: row.type,
    locationId: props.locationId ?? '',
    metadata: props.metadata,
    src: row.src_id,
  };
};

const toLocationEvent = (row: {
  id: string;
  location_id: string;
  chronicle_id: string | null;
  summary: string;
  scope: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date | null;
}): LocationEvent => ({
  chronicleId: row.chronicle_id ?? '',
  createdAt: row.created_at?.getTime() ?? now(),
  id: row.id,
  locationId: row.location_id,
  metadata: row.metadata ?? undefined,
  scope: row.scope ?? undefined,
  summary: row.summary,
});

class PostgresLocationGraphStore implements LocationGraphStore {
  readonly #pool: Pool;

  constructor(options: { pool: Pool }) {
    this.#pool = options.pool;
  }

  async ensureLocation(input: {
    locationId?: string;
    name: string;
    description?: string;
    tags?: string[];
    characterId?: string;
    kind?: string;
  }): Promise<LocationPlace> {
    const locationId = isNonEmptyString(input.locationId) ? input.locationId : randomUUID();
    const description = input.description ?? null;
    const kind = isNonEmptyString(input.kind) ? input.kind : 'locale';
    const tags = normalizeTags(input.tags, 24);
    const result = await withTransaction(this.#pool, async (client) => {
      const existing = await this.#getPlace(client, locationId);
      if (existing !== null) {
        if (isNonEmptyString(input.characterId)) {
          await this.#writeState(client, {
            anchorPlaceId: existing.id,
            certainty: 'exact',
            characterId: input.characterId,
            locationId,
            status: [],
          });
        }
        return existing;
      }
      const place = await this.#createPlaceRecord(client, {
        canonicalParentId: null,
        description,
        id: locationId,
        kind,
        locationRoot: locationId,
        name: input.name,
        parentId: null,
        tags,
      });
      if (isNonEmptyString(input.characterId)) {
        await this.#writeState(client, {
          anchorPlaceId: place.id,
          certainty: 'exact',
          characterId: input.characterId,
          locationId,
          status: [],
        });
      }
      return place;
    });
    return result;
  }

  async getLocationGraph(locationId: string): Promise<LocationGraphSnapshot> {
    const places = await this.#listPlaces(locationId);
    const edges = await this.#listEdges(locationId);
    const edgesWithLocation = edges.map((edge) =>
      edge.locationId && edge.locationId.length > 0 ? edge : { ...edge, locationId }
    );
    return {
      edges: edgesWithLocation,
      locationId,
      places,
    };
  }

  async applyPlan(input: {
    locationId: string;
    characterId: string;
    plan: LocationPlan;
  }): Promise<LocationState | null> {
    if (input.plan.ops.length === 0) {
      return this.getLocationState(input.characterId);
    }

    const nextState = await withTransaction(this.#pool, async (client) => {
      const currentState = await this.#getLocationState(client, input.characterId);
      const adapter: PlanMutationAdapter = {
        createEdge: async (edge) => this.#createEdge(client, input.locationId, edge),
        createPlace: async (place) => {
          const created = await this.#createPlaceRecord(client, {
            canonicalParentId: place.canonical_parent_id ?? null,
            description: place.description ?? null,
            id: place.id ?? randomUUID(),
            kind: place.kind,
            locationRoot: input.locationId,
            name: place.name,
            parentId: place.parent_id ?? null,
            tags: normalizeTags(place.tags, 24),
          });
          return created.id;
        },
        setCanonicalParent: async (childId, parentId) =>
          this.#setCanonicalParent(client, childId, parentId),
      };

      const result = await executeLocationPlan(input.plan, adapter);
      const next = await this.#resolveNextState(
        client,
        input,
        result,
        currentState
      );
      if (next === null) {
        return currentState;
      }
      await this.#writeState(client, next);
      return next;
    });

    return nextState;
  }

  async getLocationState(characterId: string): Promise<LocationState | null> {
    const state = await this.#getLocationState(this.#pool, characterId);
    return state;
  }

  async summarizeCharacterLocation(input: {
    locationId: string;
    characterId: string;
  }): Promise<LocationSummary | null> {
    const state = await this.getLocationState(input.characterId);
    if (
      state === null ||
      !isNonEmptyString(state.anchorPlaceId) ||
      state.locationId !== input.locationId
    ) {
      return null;
    }
    const breadcrumb = await this.#buildBreadcrumb(state.anchorPlaceId, input.locationId);
    if (breadcrumb.length === 0) {
      return null;
    }
    const tagCollections = await Promise.all(
      breadcrumb.map(async (entry) => {
        const place = await this.getPlace(entry.id);
        return place?.tags ?? [];
      })
    );
    const tags = Array.from(new Set(tagCollections.flat()));
    const anchor = await this.getPlace(state.anchorPlaceId);
    return {
      anchorPlaceId: state.anchorPlaceId,
      breadcrumb,
      certainty: state.certainty,
      description: anchor?.description,
      status: state.status ?? [],
      tags,
    };
  }

  async listLocationRoots(
    input?: { search?: string; limit?: number }
  ): Promise<LocationPlace[]> {
    const limit = Math.min(input?.limit ?? 50, 100);
    const search = coerceString(input?.search);
    const query = search === null
      ? `SELECT l.*, n.props
         FROM location l
         JOIN node n ON n.id = l.id
         WHERE l.id = l.location_root
         ORDER BY l.name ASC
         LIMIT $1`
      : `SELECT l.*, n.props
         FROM location l
         JOIN node n ON n.id = l.id
         WHERE l.id = l.location_root
           AND lower(l.name) LIKE lower($2)
         ORDER BY l.name ASC
         LIMIT $1`;
    const params = search === null ? [limit] : [limit, `%${search}%`];
    const result = await this.#pool.query(query, params);
    return result.rows.map((row) => toPlace(row as LocationRow));
  }

  async getPlace(placeId: string): Promise<LocationPlace | null> {
    return this.#getPlace(this.#pool, placeId);
  }

  async createPlace(input: {
    parentId?: string | null;
    locationId?: string;
    name: string;
    kind: string;
    tags?: string[];
    description?: string;
  }): Promise<LocationPlace> {
    const locationId = isNonEmptyString(input.locationId) ? input.locationId : null;
    const parentId = coerceString(input.parentId);
    const tags = normalizeTags(input.tags, 24);
    return withTransaction(this.#pool, async (client) => {
      const parent =
        parentId !== null ? await this.#getPlace(client, parentId) : null;
      if (parentId !== null && parent === null) {
        throw new Error(`Parent place ${parentId} not found.`);
      }
      const targetLocationId = parent?.locationId ?? locationId ?? randomUUID();
      const place = await this.#createPlaceRecord(client, {
        canonicalParentId: parent?.id ?? null,
        description: input.description ?? null,
        id: parent === null && locationId === null ? targetLocationId : randomUUID(),
        kind: input.kind,
        locationRoot: targetLocationId,
        name: input.name,
        parentId: parent?.id ?? null,
        tags,
      });
      if (parent !== null) {
        await this.#createEdge(client, targetLocationId, {
          dst: place.id,
          kind: 'CONTAINS',
          src: parent.id,
        });
      }
      return place;
    });
  }

  async updatePlace(input: {
    placeId: string;
    name?: string;
    kind?: string;
    description?: string | null;
    tags?: string[];
    canonicalParentId?: string | null;
  }): Promise<LocationPlace> {
    return withTransaction(this.#pool, async (client) => {
      const current = await this.#getPlace(client, input.placeId);
      if (current === null) {
        throw new Error(`Place ${input.placeId} not found.`);
      }
      const nextParentId = await this.#resolveParentTarget(
        client,
        current,
        input.canonicalParentId
      );
      const slug = slugify(input.name ?? current.name);
      const newPath = await this.#computePath(client, {
        parentId: nextParentId ?? null,
        slug,
      });
      const previousPath = await this.#readPath(client, current.id);

      await client.query(
        `UPDATE location
         SET name = $2,
             kind = $3,
             description = $4,
             tags = $5::text[],
             canonical_parent = $6::uuid,
             slug = $7,
             ltree_path = text2ltree($8),
             updated_at = now()
         WHERE id = $1::uuid`,
        [
          current.id,
          input.name ?? current.name,
          input.kind ?? current.kind,
          input.description === undefined ? current.description ?? null : input.description,
          input.tags ?? current.tags ?? [],
          nextParentId ?? null,
          slug,
          newPath,
        ]
      );

      if (previousPath !== null && newPath !== null && previousPath !== newPath) {
        await client.query(
          `UPDATE location
           SET ltree_path = text2ltree($2) || subpath(ltree_path, nlevel(text2ltree($1)))
           WHERE ltree_path <@ text2ltree($1)`,
          [previousPath, newPath]
        );
      }

      return (await this.#getPlace(client, current.id)) as LocationPlace;
    });
  }

  async addEdge(input: {
    locationId: string;
    src: string;
    dst: string;
    kind: LocationEdgeKind;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await withTransaction(this.#pool, async (client) => {
      await this.#ensurePlaceInLocation(client, input.locationId, input.src);
      await this.#ensurePlaceInLocation(client, input.locationId, input.dst);
      await this.#createEdge(client, input.locationId, input, input.metadata);
    });
  }

  async removeEdge(input: {
    locationId: string;
    src: string;
    dst: string;
    kind: LocationEdgeKind;
  }): Promise<void> {
    await this.#pool.query(
      `DELETE FROM edge
       WHERE src_id = $1::uuid AND dst_id = $2::uuid AND type = $3`,
      [input.src, input.dst, input.kind]
    );
  }

  async createLocationChain(input: {
    parentId?: string | null;
    segments: Array<{ name: string; kind: string; tags?: string[]; description?: string }>;
  }): Promise<{ anchor: LocationPlace; created: LocationPlace[] }> {
    if (input.segments.length === 0) {
      throw new Error('segments_required');
    }
    const parentId = coerceString(input.parentId);
    return withTransaction(this.#pool, async (client) => {
      const parent = parentId !== null ? await this.#getPlace(client, parentId) : null;
      if (parentId !== null && parent === null) {
        throw new Error(`Parent place ${parentId} not found.`);
      }
      const locationId = parent?.locationId ?? randomUUID();
      const created: LocationPlace[] = [];
      let lastParent = parent;
      for (const segment of input.segments) {
        const place = await this.#createPlaceRecord(client, {
          canonicalParentId: lastParent?.id ?? null,
          description: segment.description ?? null,
          id: lastParent === null && created.length === 0 ? locationId : randomUUID(),
          kind: segment.kind,
          locationRoot: locationId,
          name: segment.name,
          parentId: lastParent?.id ?? null,
          tags: normalizeTags(segment.tags, 24),
        });
        if (lastParent !== null) {
          await this.#createEdge(client, locationId, {
            dst: place.id,
            kind: 'CONTAINS',
            src: lastParent.id,
          });
        }
        created.push(place);
        lastParent = place;
      }
      const anchor = lastParent ?? parent;
      if (anchor === null) {
        throw new Error('anchor_not_created');
      }
      return { anchor, created };
    });
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
    if (input.events.length === 0) {
      return [];
    }
    const nowMs = now();
    const rows: Array<{
      id: string;
      location_id: string;
      chronicle_id: string;
      summary: string;
      scope: string | null;
      metadata: Record<string, unknown> | null;
      created_at: Date;
    }> = input.events.map((event, index) => ({
      created_at: new Date(nowMs + index),
      chronicle_id: event.chronicleId,
      id: randomUUID(),
      location_id: input.locationId,
      metadata: event.metadata ?? null,
      scope: coerceString(event.scope),
      summary: event.summary,
    }));
    const values = rows
      .map(
        (_, index) =>
          `($${index * 7 + 1}, $${index * 7 + 2}, $${index * 7 + 3}, $${index * 7 + 4}, $${index * 7 + 5}, $${index * 7 + 6}::jsonb, $${index * 7 + 7})`
      )
      .join(', ');
    const params = rows.flatMap((row) => [
      row.id,
      row.location_id,
      row.chronicle_id,
      row.summary,
      row.scope,
      JSON.stringify(row.metadata ?? {}),
      row.created_at,
    ]);
    await this.#pool.query(
      `INSERT INTO location_event (id, location_id, chronicle_id, summary, scope, metadata, created_at)
       VALUES ${values}`,
      params
    );
    return rows.map((row) => toLocationEvent(row));
  }

  async listLocationEvents(input: { locationId: string }): Promise<LocationEvent[]> {
    const result = await this.#pool.query(
      `SELECT id, location_id, chronicle_id, summary, scope, metadata, created_at
       FROM location_event
       WHERE location_id = $1::uuid
       ORDER BY created_at ASC`,
      [input.locationId]
    );
    return result.rows.map((row) => toLocationEvent(row));
  }

  async #listPlaces(locationId: string): Promise<LocationPlace[]> {
    const result = await this.#pool.query(
      `SELECT l.*, n.props
       FROM location l
       JOIN node n ON n.id = l.id
       WHERE l.location_root = $1::uuid
       ORDER BY l.created_at ASC`,
      [locationId]
    );
    return result.rows.map((row) => toPlace(row as LocationRow));
  }

  async #listEdges(locationId: string): Promise<LocationEdge[]> {
    const result = await this.#pool.query(
      `SELECT e.src_id, e.dst_id, e.type, e.props, e.created_at
       FROM edge e
       WHERE EXISTS (
         SELECT 1 FROM location ls WHERE ls.id = e.src_id AND ls.location_root = $1::uuid
       )
       AND EXISTS (
         SELECT 1 FROM location ld WHERE ld.id = e.dst_id AND ld.location_root = $1::uuid
       )`,
      [locationId]
    );
    return result.rows.map((row) => toEdge(row as never));
  }

  async #createEdge(
    client: PoolClient,
    locationId: string,
    edge: LocationPlanEdge,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const createdAt = now();
    await client.query(
      `INSERT INTO edge (id, src_id, dst_id, type, props, created_at)
       SELECT $1::uuid, $2::uuid, $3::uuid, $4, $5::jsonb, to_timestamp($6 / 1000.0)
       WHERE NOT EXISTS (
         SELECT 1 FROM edge WHERE src_id = $2::uuid AND dst_id = $3::uuid AND type = $4
       )`,
      [
        randomUUID(),
        edge.src,
        edge.dst,
        edge.kind,
        JSON.stringify({ metadata, locationId, createdAt }),
        createdAt,
      ]
    );
  }

  async #getPlace(executor: Queryable, placeId: string): Promise<LocationPlace | null> {
    const result = await executor.query(
      `SELECT l.*, n.props
       FROM location l
       JOIN node n ON n.id = l.id
       WHERE l.id = $1::uuid`,
      [placeId]
    );
    const row = result.rows[0] as LocationRow | undefined;
    return row ? toPlace(row) : null;
  }

  async #createPlaceRecord(
    client: PoolClient,
    input: {
      id: string;
      locationRoot: string;
      parentId: string | null;
      name: string;
      kind: string;
      tags: string[];
      description: string | null;
      canonicalParentId: string | null;
    }
  ): Promise<LocationPlace> {
    const slug = slugify(input.name);
    const path = await this.#computePath(client, { parentId: input.parentId, slug });
    const place: LocationPlace = {
      canonicalParentId: input.canonicalParentId ?? undefined,
      createdAt: now(),
      description: input.description ?? undefined,
      id: input.id,
      kind: input.kind,
      locationId: input.locationRoot,
      metadata: undefined,
      name: input.name,
      tags: input.tags ?? [],
      updatedAt: now(),
    };
    await client.query(
      `INSERT INTO node (id, kind, props, created_at)
       VALUES ($1::uuid, 'location', $2::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET props = EXCLUDED.props`,
      [input.id, JSON.stringify(place)]
    );
    await client.query(
      `INSERT INTO location (
         id, slug, name, kind, tags, ltree_path, location_root, canonical_parent, description, created_at, updated_at
       ) VALUES ($1::uuid, $2, $3, $4, $5::text[], text2ltree($6), $7::uuid, $8::uuid, $9, now(), now())
       ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           kind = EXCLUDED.kind,
           tags = EXCLUDED.tags,
           ltree_path = EXCLUDED.ltree_path,
           canonical_parent = EXCLUDED.canonical_parent,
           description = EXCLUDED.description,
           updated_at = now()`,
      [
        input.id,
        slug,
        input.name,
        input.kind,
        input.tags ?? [],
        path ?? slug,
        input.locationRoot,
        input.canonicalParentId ?? null,
        input.description,
      ]
    );
    return place;
  }

  async #writeState(
    executor: Queryable,
    state: {
      characterId: string;
      locationId: string;
      anchorPlaceId: string;
      certainty: LocationState['certainty'];
      status: string[];
      note?: string | null;
    }
  ): Promise<void> {
    await executor.query(
      `INSERT INTO character_location_state (
         character_id, location_id, anchor_place_id, certainty, status, note, updated_at
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::text[], $6, now())
       ON CONFLICT (character_id) DO UPDATE
       SET location_id = EXCLUDED.location_id,
           anchor_place_id = EXCLUDED.anchor_place_id,
           certainty = EXCLUDED.certainty,
           status = EXCLUDED.status,
           note = EXCLUDED.note,
           updated_at = now()`,
      [
        state.characterId,
        state.locationId,
        state.anchorPlaceId,
        state.certainty,
        state.status ?? [],
        state.note ?? null,
      ]
    );
  }

  async #getLocationState(executor: Queryable, characterId: string): Promise<LocationState | null> {
    const result = await executor.query(
      `SELECT character_id, location_id, anchor_place_id, certainty, status, note, updated_at
       FROM character_location_state
       WHERE character_id = $1::uuid`,
      [characterId]
    );
    const row = result.rows[0] as LocationStateRow | undefined;
    if (!row) {
      return null;
    }
    return {
      anchorPlaceId: row.anchor_place_id,
      certainty: row.certainty,
      characterId: row.character_id,
      locationId: row.location_id,
      note: row.note ?? undefined,
      status: row.status ?? [],
      updatedAt: row.updated_at?.getTime() ?? now(),
    };
  }

  async #buildBreadcrumb(placeId: string, locationId: string): Promise<Array<{ id: string; kind: string; name: string }>> {
    const result = await this.#pool.query(
      `WITH anchor AS (
         SELECT ltree_path FROM location WHERE id = $1::uuid AND location_root = $2::uuid
       )
       SELECT id, name, kind
       FROM location, anchor
       WHERE location_root = $2::uuid
         AND anchor.ltree_path IS NOT NULL
         AND location.ltree_path @> anchor.ltree_path
       ORDER BY nlevel(location.ltree_path) ASC`,
      [placeId, locationId]
    );
    return result.rows.map((row) => ({
      id: row.id as string,
      kind: row.kind as string,
      name: row.name as string,
    }));
  }

  async #resolveParentTarget(
    client: PoolClient,
    place: LocationPlace,
    candidate?: string | null
  ): Promise<string | undefined> {
    if (candidate === undefined) {
      return place.canonicalParentId ?? undefined;
    }
    const parentId = coerceString(candidate);
    if (parentId === null) {
      return undefined;
    }
    if (parentId === place.id) {
      throw new Error('A location cannot be its own parent.');
    }
    const parent = await this.#getPlace(client, parentId);
    if (parent === null) {
      throw new Error(`Parent place ${parentId} not found.`);
    }
    if (parent.locationId !== place.locationId) {
      throw new Error('Parent place must belong to the same location.');
    }
    return parent.id;
  }

  async #ensurePlaceInLocation(
    client: PoolClient,
    locationId: string,
    placeId: string
  ): Promise<void> {
    const result = await client.query(
      'SELECT 1 FROM location WHERE id = $1::uuid AND location_root = $2::uuid',
      [placeId, locationId]
    );
    if (result.rowCount === 0) {
      throw new Error('Edge endpoints must belong to the specified location.');
    }
  }

  async #setCanonicalParent(client: PoolClient, childId: string, parentId: string): Promise<void> {
    const child = await this.#getPlace(client, childId);
    const parent = await this.#getPlace(client, parentId);
    if (child === null || parent === null) {
      return;
    }
    if (child.locationId !== parent.locationId) {
      throw new Error('Parent and child must share the same location.');
    }
    const slug = slugify(child.name);
    const newPath = await this.#computePath(client, { parentId: parent.id, slug });
    const previousPath = await this.#readPath(client, child.id);
    await client.query(
      `UPDATE location
       SET canonical_parent = $2::uuid,
           ltree_path = text2ltree($3),
           updated_at = now()
       WHERE id = $1::uuid`,
      [child.id, parent.id, newPath ?? slug]
    );
    if (previousPath !== null && newPath !== null && previousPath !== newPath) {
      await client.query(
        `UPDATE location
         SET ltree_path = text2ltree($2) || subpath(ltree_path, nlevel(text2ltree($1)))
         WHERE ltree_path <@ text2ltree($1)`,
        [previousPath, newPath]
      );
    }
  }

  async #computePath(
    executor: Queryable,
    input: { parentId: string | null; slug: string }
  ): Promise<string | null> {
    if (input.parentId === null) {
      return input.slug;
    }
    const result = await executor.query(
      'SELECT ltree_path::text as path FROM location WHERE id = $1::uuid',
      [input.parentId]
    );
    const row = result.rows[0] as { path?: string } | undefined;
    const parentPath = row?.path ?? null;
    if (parentPath === null) {
      return input.slug;
    }
    return `${parentPath}.${input.slug}`;
  }

  async #readPath(executor: Queryable, placeId: string): Promise<string | null> {
    const result = await executor.query(
      'SELECT ltree_path::text AS path FROM location WHERE id = $1::uuid',
      [placeId]
    );
    const row = result.rows[0] as { path?: string } | undefined;
    return row?.path ?? null;
  }

  async #resolveNextState(
    client: PoolClient,
    input: { locationId: string; characterId: string },
    result: PlanExecutionResult,
    currentState: LocationState | null
  ): Promise<LocationState | null> {
    const anchor = result.anchorPlaceId ?? currentState?.anchorPlaceId ?? null;
    if (!isNonEmptyString(anchor)) {
      return null;
    }
    const state: LocationState = {
      anchorPlaceId: anchor,
      certainty: result.certainty ?? currentState?.certainty ?? 'exact',
      characterId: input.characterId,
      locationId: input.locationId,
      note: result.note ?? currentState?.note,
      status: result.status ?? currentState?.status ?? [],
      updatedAt: now(),
    };
    const place = await this.#getPlace(client, anchor);
    if (place !== null && place.locationId !== input.locationId) {
      throw new Error('Anchor place must belong to the target location.');
    }
    return state;
  }
}

export function createLocationGraphStore(options?: {
  connectionString?: string;
  pool?: Pool;
}): LocationGraphStore {
  const pool = createPool({
    connectionString: options?.connectionString,
    pool: options?.pool,
  });
  return new PostgresLocationGraphStore({ pool });
}
