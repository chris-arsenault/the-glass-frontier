import type { S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import {
  LocationGraphSnapshot,
  LocationPlan,
  LocationPlanEdge,
  LocationPlanPlace,
  LocationPlace,
  LocationState,
  LocationSummary,
  LocationEdgeKind,
} from '@glass-frontier/dto';
import type { LocationGraphStore } from './locationGraphStore';
import { LocationGraphIndexRepository } from './locationGraphIndexRepository';
import { executeLocationPlan, type PlanMutationAdapter } from './locationGraphPlan';
import { HybridObjectStore } from './hybridObjectStore';

export class S3LocationGraphStore extends HybridObjectStore implements LocationGraphStore {
  #index: LocationGraphIndexRepository;
  #placeCache = new Map<string, LocationPlace>();
  #stateCache = new Map<string, LocationState>();

  constructor(options: {
    bucket: string;
    prefix?: string | null;
    client?: S3Client;
    region?: string;
    index: LocationGraphIndexRepository;
  }) {
    super({
      bucket: options.bucket,
      prefix: options.prefix,
      client: options.client,
      region: options.region,
    });
    this.#index = options.index;
  }

  async ensureLocation(input: {
    locationId?: string;
    name: string;
    description?: string;
    tags?: string[];
    characterId?: string;
    kind?: string;
  }): Promise<LocationPlace> {
    const locationId = input.locationId ?? randomUUID();
    const existing = await this.#getPlace(locationId);
    if (existing) {
      if (input.characterId) {
        await this.#writeState({
          characterId: input.characterId,
          locationId,
          anchorPlaceId: existing.id,
          certainty: 'exact',
          status: [],
          updatedAt: Date.now(),
        });
      }
      return existing;
    }

    const place = await this.#createPlaceRecord(locationId, {
      id: locationId,
      name: input.name,
      kind: input.kind ?? 'locale',
      tags: input.tags ?? [],
      description: input.description,
    });

    if (input.characterId) {
      await this.#writeState({
        characterId: input.characterId,
        locationId,
        anchorPlaceId: place.id,
        certainty: 'exact',
        status: [],
        updatedAt: Date.now(),
      });
    }

    return place;
  }

  async getLocationGraph(locationId: string): Promise<LocationGraphSnapshot> {
    const placeIds = await this.#index.listLocationPlaceIds(locationId);
    const placeRecords = await Promise.all(placeIds.map((placeId) => this.#getPlace(placeId)));
    const places = placeRecords.filter((place): place is LocationPlace => Boolean(place));
    const edgesMeta = await this.#index.listLocationEdges(locationId);
    const edges = await Promise.all(
      edgesMeta.map(async (edge) => {
        const metadata = await this.#readEdgeMetadata(locationId, edge);
        return {
          locationId,
          src: edge.src,
          dst: edge.dst,
          kind: edge.kind,
          createdAt: Date.now(),
          metadata: metadata ?? undefined,
        };
      })
    );
    return {
      locationId,
      places,
      edges,
    };
  }

  async applyPlan(input: {
    locationId: string;
    characterId: string;
    plan: LocationPlan;
  }): Promise<LocationState | null> {
    if (!input.plan.ops.length) {
      return this.getLocationState(input.characterId);
    }

    const adapter: PlanMutationAdapter = {
      createPlace: async (place) => {
        const record = await this.#createPlace(input.locationId, place);
        return record.id;
      },
      createEdge: async (edge) => {
        await this.#createEdge(input.locationId, edge);
      },
      setCanonicalParent: async (childId, parentId) => {
        await this.#setCanonicalParent(childId, parentId);
      },
    };

    const result = await executeLocationPlan(input.plan, adapter);
    const currentState = await this.getLocationState(input.characterId);
    const anchorPlaceId = result.anchorPlaceId ?? currentState?.anchorPlaceId;
    if (!anchorPlaceId) {
      return currentState ?? null;
    }
    const nextState: LocationState = {
      characterId: input.characterId,
      locationId: input.locationId,
      anchorPlaceId,
      certainty: result.certainty ?? currentState?.certainty ?? 'exact',
      status: result.status ?? currentState?.status ?? [],
      note: result.note ?? currentState?.note,
      updatedAt: Date.now(),
    };
    await this.#writeState(nextState);
    return nextState;
  }

  async getLocationState(characterId: string): Promise<LocationState | null> {
    const cached = this.#stateCache.get(characterId);
    if (cached) return cached;
    const record = await this.getJson<LocationState>(this.#stateKey(characterId));
    if (record) {
      this.#stateCache.set(characterId, record);
    }
    return record ?? null;
  }

  async summarizeCharacterLocation(input: {
    locationId: string;
    characterId: string;
  }): Promise<LocationSummary | null> {
    const state = await this.getLocationState(input.characterId);
    if (!state?.anchorPlaceId || state.locationId !== input.locationId) {
      return null;
    }
    const breadcrumb = await this.#buildBreadcrumb(state.anchorPlaceId, input.locationId);
    if (!breadcrumb.length) {
      return null;
    }
    const tags = Array.from(
      new Set(
        await Promise.all(
          breadcrumb.map(async (entry) => {
            const place = await this.#getPlace(entry.id);
            return place?.tags ?? [];
          })
        ).then((list) => list.flat())
      )
    );
    return {
      anchorPlaceId: state.anchorPlaceId,
      breadcrumb,
      tags,
      status: state.status ?? [],
      certainty: state.certainty,
      description: (await this.#getPlace(state.anchorPlaceId))?.description,
    };
  }

  async listLocationRoots(
    input?: { search?: string; limit?: number }
  ): Promise<LocationPlace[]> {
    const keys = await this.list('location-graph/places/', { suffix: '.json' });
    const matches: LocationPlace[] = [];
    const search = input?.search?.trim().toLowerCase() ?? null;
    const limit = input?.limit ?? 50;
    for (const key of keys) {
      const record = await this.getJson<LocationPlace>(key);
      if (!record) continue;
      if (record.id !== record.locationId) continue;
      if (search && !record.name.toLowerCase().includes(search)) {
        continue;
      }
      matches.push(record);
      if (!search && matches.length >= limit) {
        break;
      }
    }
    matches.sort((a, b) => a.name.localeCompare(b.name));
    return matches.slice(0, limit);
  }

  async getPlace(placeId: string): Promise<LocationPlace | null> {
    return this.#getPlace(placeId);
  }

  async createPlace(input: {
    parentId?: string | null;
    locationId?: string;
    name: string;
    kind: string;
    tags?: string[];
    description?: string;
  }): Promise<LocationPlace> {
    const parent = input.parentId ? await this.#getPlace(input.parentId) : null;
    if (input.parentId && !parent) {
      throw new Error(`Parent place ${input.parentId} not found.`);
    }
    const locationId = parent?.locationId ?? input.locationId ?? randomUUID();
    const record = await this.#createPlaceRecord(locationId, {
      name: input.name,
      kind: input.kind,
      tags: input.tags,
      description: input.description,
      canonicalParentId: parent?.id,
      id: parent ? undefined : locationId,
    });
    if (parent) {
      await this.#createEdge(locationId, {
        src: parent.id,
        dst: record.id,
        kind: 'CONTAINS',
      });
    }
    return record;
  }

  async createLocationChain(input: {
    parentId?: string | null;
    segments: Array<{ name: string; kind: string; tags?: string[]; description?: string }>;
  }): Promise<{ anchor: LocationPlace; created: LocationPlace[] }> {
    if (!input.segments.length) {
      throw new Error('segments_required');
    }
    const parent = input.parentId ? await this.#getPlace(input.parentId) : null;
    if (input.parentId && !parent) {
      throw new Error(`Parent place ${input.parentId} not found.`);
    }
    let locationId = parent?.locationId ?? randomUUID();
    const created: LocationPlace[] = [];
    let currentParent = parent;
    for (let index = 0; index < input.segments.length; index += 1) {
      const segment = input.segments[index];
      const isRootSegment = !parent && index === 0;
      const record = await this.#createPlaceRecord(locationId, {
        id: isRootSegment ? locationId : undefined,
        name: segment.name,
        kind: segment.kind,
        tags: segment.tags,
        description: segment.description,
        canonicalParentId: currentParent?.id,
      });
      if (currentParent) {
        await this.#createEdge(locationId, {
          src: currentParent.id,
          dst: record.id,
          kind: 'CONTAINS',
        });
      }
      created.push(record);
      currentParent = record;
    }
    const anchor = currentParent ?? parent;
    if (!anchor) {
      throw new Error('anchor_not_created');
    }
    return { anchor, created };
  }

  async #createPlace(locationId: string, place: LocationPlanPlace): Promise<LocationPlace> {
    return this.#createPlaceRecord(locationId, {
      name: place.name,
      kind: place.kind,
      tags: place.tags,
      description: place.description,
    });
  }

  async #createPlaceRecord(
    locationId: string,
    input: {
      id?: string;
      name: string;
      kind: string;
      tags?: string[];
      description?: string;
      canonicalParentId?: string;
    }
  ): Promise<LocationPlace> {
    const record: LocationPlace = {
      id: input.id ?? randomUUID(),
      locationId,
      name: input.name,
      kind: input.kind,
      tags: input.tags ?? [],
      description: input.description,
      canonicalParentId: input.canonicalParentId,
      createdAt: Date.now(),
    };
    await this.#writePlace(record);
    await this.#index.registerPlace(locationId, record.id);
    return record;
  }

  async #createEdge(locationId: string, edge: LocationPlanEdge): Promise<void> {
    const entry = {
      locationId,
      src: edge.src,
      dst: edge.dst,
      kind: edge.kind,
      createdAt: Date.now(),
    };
    await this.setJson(this.#edgeKey(locationId, edge), entry);
    await this.#index.registerEdge(locationId, edge);
  }

  async #setCanonicalParent(childId: string, parentId: string): Promise<void> {
    const place = await this.#getPlace(childId);
    if (!place) return;
    const updated: LocationPlace = { ...place, canonicalParentId: parentId };
    await this.#writePlace(updated);
  }

  async #buildBreadcrumb(placeId: string, locationId: string) {
    const path: Array<{ id: string; name: string; kind: string }> = [];
    let current = await this.#getPlace(placeId);
    const maxDepth = 20;
    let depth = 0;
    while (current && current.locationId === locationId && depth < maxDepth) {
      path.unshift({
        id: current.id,
        name: current.name,
        kind: current.kind,
      });
      if (!current.canonicalParentId) {
        break;
      }
      current = await this.#getPlace(current.canonicalParentId);
      depth += 1;
    }
    return path;
  }

  async #getPlace(placeId: string): Promise<LocationPlace | null> {
    const cached = this.#placeCache.get(placeId);
    if (cached) return cached;
    const record = await this.getJson<LocationPlace>(this.#placeKey(placeId));
    if (record) {
      this.#placeCache.set(placeId, record);
      return record;
    }
    return null;
  }

  async #writePlace(place: LocationPlace): Promise<void> {
    this.#placeCache.set(place.id, place);
    await this.setJson(this.#placeKey(place.id), place);
  }

  #placeKey(placeId: string) {
    return `location-graph/places/${placeId}.json`;
  }

  #edgeKey(locationId: string, edge: { src: string; kind: LocationEdgeKind; dst: string }) {
    return `location-graph/${locationId}/edges/${edge.src}-${edge.kind}-${edge.dst}.json`;
  }

  #stateKey(characterId: string) {
    return `location-graph/states/${characterId}.json`;
  }

  async #writeState(state: LocationState): Promise<void> {
    this.#stateCache.set(state.characterId, state);
    await this.setJson(this.#stateKey(state.characterId), state);
  }

  async #readEdgeMetadata(
    locationId: string,
    edge: { src: string; kind: LocationEdgeKind; dst: string }
  ) {
    try {
      return await this.getJson<Record<string, unknown>>(this.#edgeKey(locationId, edge));
    } catch {
      return null;
    }
  }
}
