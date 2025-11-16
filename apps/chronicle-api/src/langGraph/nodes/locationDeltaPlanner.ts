import type {
  Character,
  CharacterLocationState,
  LocationBreadcrumbEntry,
  LocationNeighborSummary,
  LocationSummary,
  WorldStateStoreV2,
} from '@glass-frontier/worldstate';

const MAX_NEIGHBORS = 25;

export type DeltaDecision = {
  action: 'no_change' | 'move' | 'uncertain';
  destination: string;
  link: 'same' | 'adjacent' | 'inside' | 'linked';
};

export type PromptInput = {
  adjacent: string[];
  children: string[];
  current: string;
  currentId: string;
  gmResponse: string;
  links: string[];
  parent: string | null;
  playerIntent: string;
};

export type PlannerContext = {
  characterId: string;
  locationId: string;
  currentName: string;
  currentPlaceId: string;
  currentBreadcrumb: LocationBreadcrumbEntry[];
  parentName: string | null;
  neighbors: Map<string, NeighborRef>;
  children: string[];
  adjacent: string[];
  links: string[];
};

export type NeighborRef = {
  placeId: string;
  name: string;
  breadcrumb: LocationBreadcrumbEntry[];
};

export type DecisionResolution =
  | { kind: 'noop' }
  | { kind: 'uncertain' }
  | { kind: 'move'; target: NeighborRef };

export async function buildPlannerContext(options: {
  store: WorldStateStoreV2;
  character: Character | null;
  locationSummary: LocationSummary | null;
  locationId: string | null | undefined;
}): Promise<PlannerContext | null> {
  const characterId = options.character?.id;
  if (!isNonEmptyString(characterId) || !isNonEmptyString(options.locationId)) {
    return null;
  }
  const locationSummary =
    options.locationSummary ?? (await options.store.getLocation(options.locationId ?? ''));
  if (!locationSummary) {
    return null;
  }
  const state = resolveLocationState(options.character, locationSummary);
  if (!state) {
    return null;
  }
  const buckets = await fetchNeighborBuckets(options.store, state.locationId, state.placeId);
  const neighbors = buildNeighborMap(buckets, state.parent);
  return {
    characterId,
    locationId: state.locationId,
    currentName: state.placeName,
    currentPlaceId: state.placeId,
    currentBreadcrumb: state.breadcrumb,
    parentName: state.parent?.name ?? null,
    neighbors,
    children: buckets.children.map((entry) => entry.name),
    adjacent: buckets.adjacent.map((entry) => entry.name),
    links: buckets.links.map((entry) => entry.name),
  };
}

export function buildPromptInput(
  context: PlannerContext,
  gmResponse: string,
  playerIntent: string
): PromptInput {
  return {
    adjacent: context.adjacent.slice(0, MAX_NEIGHBORS),
    children: context.children.slice(0, MAX_NEIGHBORS),
    current: context.currentName,
    currentId: context.currentPlaceId,
    gmResponse,
    links: context.links.slice(0, MAX_NEIGHBORS),
    parent: context.parentName,
    playerIntent,
  };
}

export function resolveDecision(
  context: PlannerContext,
  decision: DeltaDecision
): DecisionResolution {
  if (decision.action === 'no_change') {
    return { kind: 'noop' };
  }
  if (decision.action === 'uncertain') {
    return { kind: 'uncertain' };
  }
  const target = context.neighbors.get(normalize(decision.destination));
  if (!target) {
    return { kind: 'uncertain' };
  }
  return { kind: 'move', target };
}

type NeighborBuckets = {
  children: LocationNeighborSummary[];
  adjacent: LocationNeighborSummary[];
  links: LocationNeighborSummary[];
};

const fetchNeighborBuckets = async (
  store: WorldStateStoreV2,
  locationId: string,
  placeId: string
): Promise<NeighborBuckets> => {
  const [children, adjacent, links] = await Promise.all([
    listNeighbors(store, locationId, placeId, ['CONTAINS']),
    listNeighbors(store, locationId, placeId, ['ADJACENT_TO']),
    listNeighbors(store, locationId, placeId, ['LINKS_TO', 'DOCKED_TO']),
  ]);
  return { children, adjacent, links };
};

const listNeighbors = async (
  store: WorldStateStoreV2,
  locationId: string,
  placeId: string,
  relationKinds: string[]
): Promise<LocationNeighborSummary[]> => {
  const res = await store.listLocationNeighbors(locationId, placeId, {
    relationKinds,
    limit: MAX_NEIGHBORS,
    maxDepth: 1,
  });
  return res.items ?? [];
};

const buildNeighborMap = (
  buckets: NeighborBuckets,
  parent: NeighborRef | null
): Map<string, NeighborRef> => {
  const map = new Map<string, NeighborRef>();
  const add = (entry: NeighborRef): void => {
    map.set(normalize(entry.name), entry);
  };
  for (const bucket of [buckets.children, buckets.adjacent, buckets.links]) {
    for (const entry of bucket) {
      add({
        placeId: entry.placeId,
        name: entry.name,
        breadcrumb: entry.breadcrumb,
      });
    }
  }
  if (parent) {
    add(parent);
  }
  return map;
};

const resolveLocationState = (
  character: Character | null,
  summary: LocationSummary
):
  | (CharacterLocationState & {
      parent: NeighborRef | null;
      placeName: string;
    })
  | null => {
  const state = character?.locationState;
  if (state && state.locationId === summary.id) {
    const parentEntry = state.breadcrumb.length > 1 ? state.breadcrumb[state.breadcrumb.length - 2] : null;
    return {
      ...state,
      placeName: state.breadcrumb.at(-1)?.name ?? summary.name,
      parent: parentEntry
        ? {
            placeId: parentEntry.id,
            name: parentEntry.name,
            breadcrumb: state.breadcrumb.slice(0, -1),
          }
        : null,
    };
  }
  if (!isNonEmptyString(summary.anchorPlaceId)) {
    return null;
  }
  return {
    characterId: character?.id ?? '',
    locationId: summary.id,
    placeId: summary.anchorPlaceId,
    certainty: 1,
    breadcrumb: summary.breadcrumb,
    updatedAt: new Date().toISOString(),
    metadata: undefined,
    placeName: summary.name,
    parent: null,
  };
};

const normalize = (value: string): string => value.trim().toLowerCase();

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;
