import type {
  LocationBreadcrumbEntry,
  LocationEdge,
  LocationPlace,
  LocationPlanEdge,
} from '@glass-frontier/dto';
import type { GraphContext } from '@glass-frontier/gm-api/types';
import { isNonEmptyString } from '@glass-frontier/utils';

type LocationDetailsResult = Awaited<
  ReturnType<GraphContext['locationGraphStore']['getLocationDetails']>
>;
type NeighborResult = Awaited<
  ReturnType<GraphContext['locationGraphStore']['getLocationNeighbors']>
>;

const MAX_CHILDREN = 25;
const MAX_NEIGHBORS = 25;

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
  anchorPlace: LocationPlace;
  breadcrumb: LocationBreadcrumbEntry[];
  parentPlaceId: string | null;
  parentPlaceName: string | null;
  placeById: Map<string, LocationPlace>;
  placeByName: Map<string, LocationPlace>;
  children: LocationPlace[];
  neighbors: Array<{ edge: LocationEdge; neighbor: LocationPlace; direction: 'out' | 'in' }>;
};

export async function getPromptInput(context: GraphContext): Promise<PromptInput | null> {
  const anchorContext = await fetchAnchorContext(context);
  if (anchorContext === null) {
    return null;
  }

  const childNames = anchorContext.children
    .filter((place) => place.canonicalParentId === anchorContext.anchorPlace.id)
    .slice(0, MAX_CHILDREN)
    .map((place) => place.name);
  const adjacentNames = collectNeighborNames(anchorContext.neighbors, ['ADJACENT_TO']).slice(
    0,
    MAX_NEIGHBORS
  );
  const linkNames = collectNeighborNames(anchorContext.neighbors, ['LINKS_TO', 'DOCKED_TO']).slice(
    0,
    MAX_NEIGHBORS
  );

  return {
    adjacent: adjacentNames,
    children: childNames,
    current: anchorContext.anchorPlace.name,
    currentId: anchorContext.anchorPlace.id,
    gmResponse: context.gmResponse?.content ?? '',
    links: linkNames,
    parent: anchorContext.parentPlaceName,
    playerIntent: context.playerMessage?.content ?? '',
  };
}

export async function resolvePlanContext(context: GraphContext): Promise<PlannerContext | null> {
  const anchorContext = await fetchAnchorContext(context);
  if (anchorContext === null) {
    return null;
  }

  const placeById = buildPlaceIdIndex(
    anchorContext.anchorPlace,
    anchorContext.children,
    anchorContext.neighbors
  );
  const placeByName = buildPlaceNameIndex(placeById);

  return {
    anchorPlace: anchorContext.anchorPlace,
    breadcrumb: anchorContext.breadcrumb,
    children: anchorContext.children,
    neighbors: anchorContext.neighbors,
    parentPlaceId: anchorContext.parentPlaceId,
    parentPlaceName: anchorContext.parentPlaceName,
    placeById,
    placeByName,
  };
}

async function fetchAnchorContext(
  context: GraphContext
): Promise<{
  anchorPlace: LocationPlace;
  breadcrumb: LocationBreadcrumbEntry[];
  children: LocationPlace[];
  neighbors: NeighborResult;
  parentPlaceId: string | null;
  parentPlaceName: string | null;
} | null> {
  const anchorId =
    context.chronicleState.location?.anchorPlaceId ?? context.chronicleState.chronicle.locationId;
  if (!isNonEmptyString(anchorId)) {
    return null;
  }

  let details: LocationDetailsResult;
  let neighbors: NeighborResult;
  try {
    [details, neighbors] = await Promise.all([
      context.locationGraphStore.getLocationDetails({ id: anchorId }),
      context.locationGraphStore.getLocationNeighbors({ id: anchorId, limit: 200 }),
    ]);
  } catch {
    return null;
  }

  const anchorPlace = details.place;
  const breadcrumb = normalizeBreadcrumb(details.breadcrumb, anchorPlace);
  const { parentId, parentName } = resolveParentInfo(anchorPlace, breadcrumb);
  return {
    anchorPlace,
    breadcrumb,
    children: details.children,
    neighbors,
    parentPlaceId: parentId,
    parentPlaceName: parentName,
  };
}

const normalizeBreadcrumb = (
  breadcrumb: LocationDetailsResult['breadcrumb'],
  anchorPlace: LocationPlace
): LocationBreadcrumbEntry[] => {
  if (Array.isArray(breadcrumb) && breadcrumb.length > 0) {
    return breadcrumb.map((entry: LocationBreadcrumbEntry) => ({
      id: entry.id,
      kind: entry.kind,
      name: entry.name,
    }));
  }
  return [{ id: anchorPlace.id, kind: anchorPlace.kind, name: anchorPlace.name }];
};

const buildPlaceIdIndex = (
  anchor: LocationPlace,
  children: LocationPlace[],
  neighbors: NeighborResult
): Map<string, LocationPlace> => {
  const map = new Map<string, LocationPlace>();
  const pushPlace = (place: LocationPlace): void => {
    if (!map.has(place.id)) {
      map.set(place.id, place);
    }
  };
  pushPlace(anchor);
  for (const child of children) {
    pushPlace(child);
  }
  for (const neighbor of neighbors) {
    pushPlace(neighbor.neighbor);
  }
  return map;
};

const buildPlaceNameIndex = (placeById: Map<string, LocationPlace>): Map<string, LocationPlace> => {
  const map = new Map<string, LocationPlace>();
  for (const place of placeById.values()) {
    map.set(normalizeName(place.name), place);
  }
  return map;
};

export const resolveParentInfo = (
  anchorPlace: LocationPlace,
  breadcrumb: LocationBreadcrumbEntry[]
): { parentId: string | null; parentName: string | null } => {
  const parentId =
    anchorPlace.canonicalParentId ??
    (breadcrumb.length > 1 ? breadcrumb[breadcrumb.length - 2]?.id ?? null : null);
  const parentName = breadcrumb.length > 1 ? breadcrumb[breadcrumb.length - 2]?.name ?? null : null;
  return { parentId: parentId ?? null, parentName: parentName ?? null };
};

export const normalizeName = (value: string): string => {
  const lower = value.toLowerCase();
  const stripped = lower.replace(/[^a-z0-9]+/g, '');
  if (stripped.length > 0) {
    return stripped;
  }
  return lower.trim();
};

const collectNeighborNames = (
  neighbors: NeighborResult,
  kinds: Array<LocationPlanEdge['kind']>
): string[] => {
  const names: string[] = [];
  for (const item of neighbors as Array<{ edge: LocationEdge; neighbor: LocationPlace }>) {
    if (kinds.includes(item.edge.kind)) {
      names.push(item.neighbor.name);
    }
  }
  return dedupe(names);
};

const dedupe = (values: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }
  return result;
};
