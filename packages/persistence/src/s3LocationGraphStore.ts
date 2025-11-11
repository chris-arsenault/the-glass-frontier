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

    const place: LocationPlace = {
      id: locationId,
      locationId,
      name: input.name,
      kind: input.kind ?? 'locale',
      tags: input.tags ?? [],
      description: input.description,
      createdAt: Date.now(),
    };

    await this.#writePlace(place);
    await this.#index.registerPlace(locationId, place.id);

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

  async #createPlace(locationId: string, place: LocationPlanPlace): Promise<LocationPlace> {
    const record: LocationPlace = {
      id: randomUUID(),
      locationId,
      name: place.name,
      kind: place.kind,
      tags: place.tags ?? [],
      description: place.description,
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
