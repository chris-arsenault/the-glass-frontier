import type { S3Client } from '@aws-sdk/client-s3';
import type {
  LocationGraphSnapshot,
  LocationPlan,
  LocationPlanEdge,
  LocationPlanPlace,
  LocationPlace,
  LocationState,
  LocationSummary,
  LocationEdgeKind,
} from '@glass-frontier/dto';
import { randomUUID } from 'node:crypto';

import { HybridObjectStore } from './hybridObjectStore';
import type { LocationGraphIndexRepository } from './locationGraphIndexRepository';
import {
  executeLocationPlan,
  type PlanExecutionResult,
  type PlanMutationAdapter,
} from './locationGraphPlan';
import type { LocationGraphStore } from './locationGraphStore';

type BreadcrumbEntry = { id: string; kind: string; name: string };
type LocationChainSegment = { name: string; kind: string; tags?: string[]; description?: string };
const isNonEmptyString = (value?: string | null): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const coerceString = (value?: string | null): string | null =>
  isNonEmptyString(value) ? value.trim() : null;
const normalizeSearchTerm = (value?: string | null): string | null => {
  const normalized = coerceString(value)?.toLowerCase() ?? null;
  return normalized !== null && normalized.length > 0 ? normalized : null;
};
const normalizeTags = (tags?: string[] | null): string[] => {
  if (!Array.isArray(tags)) {
    return [];
  }
  const result: string[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    const value = tag.trim().toLowerCase();
    if (value.length === 0 || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
    if (result.length >= 12) {
      break;
    }
  }
  return result;
};
export class S3LocationGraphStore extends HybridObjectStore implements LocationGraphStore {
  readonly #index: LocationGraphIndexRepository;
  readonly #placeCache = new Map<string, LocationPlace>();
  readonly #stateCache = new Map<string, LocationState>();

  constructor(options: {
    bucket: string;
    prefix?: string | null;
    client?: S3Client;
    region?: string;
    index: LocationGraphIndexRepository;
  }) {
    super({
      bucket: options.bucket,
      client: options.client,
      prefix: options.prefix,
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
    const locationId = isNonEmptyString(input.locationId) ? input.locationId : randomUUID();
    const existing = await this.#getPlace(locationId);
    const characterId = coerceString(input.characterId);
    if (existing !== null) {
      if (characterId !== null) {
        await this.#writeState({
          anchorPlaceId: existing.id,
          certainty: 'exact',
          characterId,
          locationId,
          status: [],
          updatedAt: Date.now(),
        });
      }
      return existing;
    }

    const place = await this.#createPlaceRecord(locationId, {
      description: input.description,
      id: locationId,
      kind: input.kind ?? 'locale',
      name: input.name,
      tags: input.tags ?? [],
    });

    if (characterId !== null) {
      await this.#writeState({
        anchorPlaceId: place.id,
        certainty: 'exact',
        characterId,
        locationId,
        status: [],
        updatedAt: Date.now(),
      });
    }

    return place;
  }

  async getLocationGraph(locationId: string): Promise<LocationGraphSnapshot> {
    const placeIds = await this.#index.listLocationPlaceIds(locationId);
    const placeRecords = await Promise.all(placeIds.map((placeId) => this.#getPlace(placeId)));
    const places = placeRecords.filter((place): place is LocationPlace => place !== null);
    const edgesMeta = await this.#index.listLocationEdges(locationId);
    const edges = await Promise.all(
      edgesMeta.map(async (edge) => {
        const stored = await this.#readEdgeMetadata(locationId, edge);
        const createdAtCandidate = stored !== null ? (stored as { createdAt?: unknown }).createdAt : undefined;
        const createdAt =
          typeof createdAtCandidate === 'number' && Number.isFinite(createdAtCandidate)
            ? createdAtCandidate
            : Date.now();
        const metadataContainer = stored !== null ? (stored as { metadata?: unknown }) : null;
        const metadataValue =
          metadataContainer?.metadata !== undefined
            ? (metadataContainer.metadata as Record<string, unknown>)
            : stored ?? undefined;
        return {
          createdAt,
          dst: edge.dst,
          kind: edge.kind,
          locationId,
          metadata: metadataValue,
          src: edge.src,
        };
      })
    );
    return {
      edges,
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

    const adapter: PlanMutationAdapter = {
      createEdge: async (edge) => {
        await this.#createEdge(input.locationId, edge);
      },
      createPlace: async (place) => {
        const record = await this.#createPlace(input.locationId, place);
        return record.id;
      },
      setCanonicalParent: async (childId, parentId) => {
        await this.#setCanonicalParent(childId, parentId);
      },
    };

    const result = await executeLocationPlan(input.plan, adapter);
    const currentState = await this.getLocationState(input.characterId);
    const nextState = this.#resolveNextState(input, result, currentState);
    if (nextState === null) {
      return currentState;
    }
    await this.#writeState(nextState);
    return nextState;
  }

  async getLocationState(characterId: string): Promise<LocationState | null> {
    const cached = this.#stateCache.get(characterId);
    if (cached !== undefined) {
      return cached;
    }
    const record = await this.getJson<LocationState>(this.#stateKey(characterId));
    if (record !== null) {
      this.#stateCache.set(characterId, record);
      return record;
    }
    return null;
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
        const place = await this.#getPlace(entry.id);
        return place?.tags ?? [];
      })
    );
    const tags = Array.from(new Set(tagCollections.flat()));
    return {
      anchorPlaceId: state.anchorPlaceId,
      breadcrumb,
      certainty: state.certainty,
      description: (await this.#getPlace(state.anchorPlaceId))?.description,
      status: state.status ?? [],
      tags,
    };
  }

  async listLocationRoots(
    input?: { search?: string; limit?: number }
  ): Promise<LocationPlace[]> {
    const keys = await this.list('location-graph/places/', { suffix: '.json' });
    const search = normalizeSearchTerm(input?.search);
    const limit = input?.limit ?? 50;
    const records = await Promise.all(keys.map((key) => this.getJson<LocationPlace>(key)));
    const matches = records
      .filter((record): record is LocationPlace => record !== null)
      .filter((record) => record.id === record.locationId)
      .filter((record) => {
        if (search === null) {
          return true;
        }
        return record.name.toLowerCase().includes(search);
      });
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
    const parentId = coerceString(input.parentId);
    const parent = parentId !== null ? await this.#getPlace(parentId) : null;
    if (parentId !== null && parent === null) {
      throw new Error(`Parent place ${parentId} not found.`);
    }
    const locationId = parent?.locationId ?? coerceString(input.locationId) ?? randomUUID();
    const record = await this.#createPlaceRecord(locationId, {
      canonicalParentId: parent?.id,
      description: input.description,
      id: parent !== null ? undefined : locationId,
      kind: input.kind,
      name: input.name,
      tags: input.tags,
    });
    if (parent !== null) {
      await this.#createEdge(locationId, {
        dst: record.id,
        kind: 'CONTAINS',
        src: parent.id,
      });
    }
    return record;
  }

  async updatePlace(input: {
    placeId: string;
    name?: string;
    kind?: string;
    description?: string | null;
    tags?: string[];
    canonicalParentId?: string | null;
  }): Promise<LocationPlace> {
    const current = await this.#requirePlace(input.placeId);
    const nextParentId = await this.#resolveParentTarget(current, input.canonicalParentId);
    const updated = this.#applyPlaceUpdates(current, {
      canonicalParentId: nextParentId,
      description: input.description,
      kind: input.kind,
      name: input.name,
      tags: input.tags,
    });
    await this.#syncContainmentEdges(current, nextParentId ?? undefined);
    await this.#writePlace(updated);
    return updated;
  }

  async addEdge(input: {
    locationId: string;
    src: string;
    dst: string;
    kind: LocationEdgeKind;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.#ensurePlaceInLocation(input.locationId, input.src);
    await this.#ensurePlaceInLocation(input.locationId, input.dst);
    await this.#createEdge(input.locationId, input, input.metadata);
  }

  async removeEdge(input: {
    locationId: string;
    src: string;
    dst: string;
    kind: LocationEdgeKind;
  }): Promise<void> {
    await this.#deleteEdge(input.locationId, input);
  }

  async createLocationChain(input: {
    parentId?: string | null;
    segments: LocationChainSegment[];
  }): Promise<{ anchor: LocationPlace; created: LocationPlace[] }> {
    if (input.segments.length === 0) {
      throw new Error('segments_required');
    }
    const parentId = coerceString(input.parentId);
    const parent = parentId !== null ? await this.#getPlace(parentId) : null;
    if (parentId !== null && parent === null) {
      throw new Error(`Parent place ${parentId} not found.`);
    }
    const locationId = parent?.locationId ?? randomUUID();
    const { created, lastParent } = await this.#materializeChainSegments({
      assignRootLocationId: parent === null,
      locationId,
      parent,
      segments: input.segments,
    });
    const anchor = lastParent ?? parent;
    if (anchor === null) {
      throw new Error('anchor_not_created');
    }
    return { anchor, created };
  }
  async #createPlace(locationId: string, place: LocationPlanPlace): Promise<LocationPlace> {
    return this.#createPlaceRecord(locationId, {
      description: place.description,
      kind: place.kind,
      name: place.name,
      tags: place.tags,
    });
  }

  async #materializeChainSegments(input: {
    assignRootLocationId: boolean;
    locationId: string;
    parent: LocationPlace | null;
    segments: LocationChainSegment[];
  }): Promise<{ created: LocationPlace[]; lastParent: LocationPlace | null }> {
    if (input.segments.length === 0) {
      return { created: [], lastParent: input.parent };
    }
    const [head, ...tail] = input.segments;
    const record = await this.#createPlaceRecord(input.locationId, {
      canonicalParentId: input.parent?.id,
      description: head.description,
      id: input.assignRootLocationId ? input.locationId : undefined,
      kind: head.kind,
      name: head.name,
      tags: head.tags,
    });
    if (input.parent !== null) {
      await this.#createEdge(input.locationId, {
        dst: record.id,
        kind: 'CONTAINS',
        src: input.parent.id,
      });
    }
    const next = await this.#materializeChainSegments({
      assignRootLocationId: false,
      locationId: input.locationId,
      parent: record,
      segments: tail,
    });
    return {
      created: [record, ...next.created],
      lastParent: next.lastParent,
    };
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
      canonicalParentId: input.canonicalParentId,
      createdAt: Date.now(),
      description: input.description,
      id: input.id ?? randomUUID(),
      kind: input.kind,
      locationId,
      name: input.name,
      tags: normalizeTags(input.tags),
      updatedAt: Date.now(),
    };
    await this.#writePlace(record);
    await this.#index.registerPlace(locationId, record.id);
    return record;
  }

  async #createEdge(
    locationId: string,
    edge: LocationPlanEdge,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const entry = {
      createdAt: Date.now(),
      dst: edge.dst,
      kind: edge.kind,
      locationId,
      metadata,
      src: edge.src,
    };
    await this.setJson(this.#edgeKey(locationId, edge), entry);
    await this.#index.registerEdge(locationId, edge);
  }

  async #deleteEdge(
    locationId: string,
    edge: { src: string; kind: LocationEdgeKind; dst: string }
  ): Promise<void> {
    await this.delete(this.#edgeKey(locationId, edge));
    await this.#index.unregisterEdge(locationId, edge);
  }

  async #setCanonicalParent(childId: string, parentId: string): Promise<void> {
    const place = await this.#getPlace(childId);
    if (place === null) {
      return;
    }
    const updated: LocationPlace = { ...place, canonicalParentId: parentId };
    await this.#writePlace(updated);
  }

  async #buildBreadcrumb(placeId: string, locationId: string): Promise<BreadcrumbEntry[]> {
    return this.#collectBreadcrumbTrail(placeId, locationId, 0);
  }

  async #collectBreadcrumbTrail(
    placeId: string,
    locationId: string,
    depth: number
  ): Promise<BreadcrumbEntry[]> {
    if (depth >= 20) {
      return [];
    }
    const place = await this.#getPlace(placeId);
    if (place === null || place.locationId !== locationId) {
      return [];
    }
    const parentId = coerceString(place.canonicalParentId);
    const ancestors =
      parentId !== null ? await this.#collectBreadcrumbTrail(parentId, locationId, depth + 1) : [];
    return [
      ...ancestors,
      {
        id: place.id,
        kind: place.kind,
        name: place.name,
      },
    ];
  }

  async #getPlace(placeId: string): Promise<LocationPlace | null> {
    const cached = this.#placeCache.get(placeId);
    if (cached !== undefined) {
      return cached;
    }
    const record = await this.getJson<LocationPlace>(this.#placeKey(placeId));
    if (record !== null) {
      this.#placeCache.set(placeId, record);
      return record;
    }
    return null;
  }

  async #writePlace(place: LocationPlace): Promise<void> {
    this.#placeCache.set(place.id, place);
    await this.setJson(this.#placeKey(place.id), place);
  }

  async #requirePlace(placeId: string): Promise<LocationPlace> {
    const place = await this.#getPlace(placeId);
    if (place === null) {
      throw new Error(`Place ${placeId} not found.`);
    }
    return place;
  }

  #placeKey(placeId: string): string {
    return `location-graph/places/${placeId}.json`;
  }

  #edgeKey(
    locationId: string,
    edge: { src: string; kind: LocationEdgeKind; dst: string }
  ): string {
    return `location-graph/${locationId}/edges/${edge.src}-${edge.kind}-${edge.dst}.json`;
  }

  #stateKey(characterId: string): string {
    return `location-graph/states/${characterId}.json`;
  }

  async #writeState(state: LocationState): Promise<void> {
    this.#stateCache.set(state.characterId, state);
    await this.setJson(this.#stateKey(state.characterId), state);
  }

  async #readEdgeMetadata(
    locationId: string,
    edge: { src: string; kind: LocationEdgeKind; dst: string }
  ): Promise<Record<string, unknown> | null> {
    try {
      return await this.getJson<Record<string, unknown>>(this.#edgeKey(locationId, edge));
    } catch {
      return null;
    }
  }

  async #ensurePlaceInLocation(locationId: string, placeId: string): Promise<void> {
    const place = await this.#getPlace(placeId);
    if (place === null) {
      throw new Error(`Place ${placeId} not found.`);
    }
    if (place.locationId !== locationId) {
      throw new Error('Edge endpoints must belong to the specified location.');
    }
  }

  async #resolveParentTarget(
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
    const parent = await this.#getPlace(parentId);
    if (parent === null) {
      throw new Error(`Parent place ${parentId} not found.`);
    }
    if (parent.locationId !== place.locationId) {
      throw new Error('Parent place must belong to the same location.');
    }
    return parent.id;
  }

  #applyPlaceUpdates(
    place: LocationPlace,
    updates: {
      canonicalParentId?: string;
      description?: string | null;
      kind?: string;
      name?: string;
      tags?: string[];
    }
  ): LocationPlace {
    return {
      ...place,
      canonicalParentId: updates.canonicalParentId,
      description: this.#resolveDescription(place.description, updates.description),
      kind: this.#resolveScalarField(place.kind, updates.kind),
      name: this.#resolveScalarField(place.name, updates.name),
      tags: updates.tags === undefined ? place.tags : normalizeTags(updates.tags),
      updatedAt: Date.now(),
    };
  }

  #resolveScalarField(current: string, next?: string): string {
    if (!isNonEmptyString(next)) {
      return current;
    }
    return next.trim();
  }

  #resolveDescription(current: string | undefined, next?: string | null): string | undefined {
    if (next === undefined) {
      return current;
    }
    if (next === null) {
      return undefined;
    }
    const trimmed = next.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  async #syncContainmentEdges(place: LocationPlace, nextParentId?: string): Promise<void> {
    const previousParentId = place.canonicalParentId ?? undefined;
    const didChange = (previousParentId ?? null) !== (nextParentId ?? null);
    if (!didChange) {
      return;
    }
    if (isNonEmptyString(previousParentId)) {
      await this.#deleteEdge(place.locationId, {
        dst: place.id,
        kind: 'CONTAINS',
        src: previousParentId,
      });
    }
    if (isNonEmptyString(nextParentId)) {
      await this.#createEdge(place.locationId, {
        dst: place.id,
        kind: 'CONTAINS',
        src: nextParentId,
      });
    }
  }

  #resolveNextState(
    input: { locationId: string; characterId: string },
    result: PlanExecutionResult,
    currentState: LocationState | null
  ): LocationState | null {
    const anchor = this.#determineAnchorPlaceId(result, currentState);
    if (!isNonEmptyString(anchor)) {
      return null;
    }
    return {
      anchorPlaceId: anchor,
      certainty: this.#determineCertainty(result, currentState),
      characterId: input.characterId,
      locationId: input.locationId,
      note: this.#determineNote(result, currentState),
      status: this.#determineStatus(result, currentState),
      updatedAt: Date.now(),
    };
  }

  #determineAnchorPlaceId(
    result: PlanExecutionResult,
    currentState: LocationState | null
  ): string | null {
    return result.anchorPlaceId ?? currentState?.anchorPlaceId ?? null;
  }

  #determineCertainty(
    result: PlanExecutionResult,
    currentState: LocationState | null
  ): LocationState['certainty'] {
    return result.certainty ?? currentState?.certainty ?? 'exact';
  }

  #determineNote(result: PlanExecutionResult, currentState: LocationState | null): string | undefined {
    return result.note ?? currentState?.note;
  }

  #determineStatus(
    result: PlanExecutionResult,
    currentState: LocationState | null
  ): string[] {
    return result.status ?? currentState?.status ?? [];
  }
}
