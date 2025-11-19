import {isNonEmptyString} from "@glass-frontier/utils";
import {GraphContext} from "@glass-frontier/gm-api/types";

const MAX_CHILDREN = 25;
const MAX_NEIGHBORS = 25;

import type {LocationGraphSnapshot, LocationPlace, LocationPlanEdge} from "@glass-frontier/dto";
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
  characterId: string;
  chronicleId: string;
  graph: LocationGraphSnapshot;
  parentPlace: LocationPlace | null;
  placeById: Map<string, LocationPlace>;
  placeByName: Map<string, LocationPlace>;
};

export async function getPromptInput(context: GraphContext): Promise<PromptInput | null> {
  const plannerContext = await resolvePlanContext(context);
  if (plannerContext === null) {
    return null;
  }

  return buildPromptInput(
    plannerContext,
    context.gmResponse?.content ?? '',
    context.playerMessage?.content ?? ''
  );
}


export async function resolvePlanContext(context: GraphContext): Promise<PlannerContext | null> {
  const locationId = context.chronicleState.chronicle.locationId;
  const characterId = context.chronicleState.character?.id;
  if (!isNonEmptyString(characterId) || !isNonEmptyString(locationId)) {
    return null;
  }
  const [graph, priorState] = await Promise.all([
    context.locationGraphStore.getLocationGraph(locationId),
    context.locationGraphStore.getLocationState(characterId),
  ]);
  return buildPlannerContext({
    characterId,
    chronicleId: context.chronicleId,
    graph,
    locationId,
    priorState,
  });
}

function buildPlannerContext(input: {
  graph: LocationGraphSnapshot;
  priorState: { anchorPlaceId?: string; locationId?: string } | null;
  locationId: string;
  characterId: string;
  chronicleId: string;
}): PlannerContext | null {
  if (!isNonEmptyString(input.characterId) || !isNonEmptyString(input.locationId)) {
    return null;
  }
  if (!isValidPriorState(input.priorState, input.locationId)) {
    return null;
  }
  const anchorPlace = findAnchorPlace(input.graph, input.priorState.anchorPlaceId);
  if (anchorPlace === null) {
    return null;
  }
  const placeById = buildPlaceIdIndex(input.graph);
  const placeByName = buildPlaceNameIndex(input.graph);
  const parentPlace = resolveParentPlace(anchorPlace, placeById);
  return {
    anchorPlace,
    characterId: input.characterId,
    chronicleId: input.chronicleId,
    graph: input.graph,
    parentPlace,
    placeById,
    placeByName,
  };
}

const isValidPriorState = (
  priorState: { anchorPlaceId?: string; locationId?: string } | null,
  locationId: string
): priorState is { anchorPlaceId: string; locationId: string } => {
  if (
    priorState === null ||
    typeof priorState.anchorPlaceId !== 'string' ||
    typeof priorState.locationId !== 'string'
  ) {
    return false;
  }
  return priorState.locationId === locationId;
};

export const findAnchorPlace = (
  graph: LocationGraphSnapshot,
  anchorPlaceId: string
): LocationPlace | null => graph.places.find((entry) => entry.id === anchorPlaceId) ?? null;

const buildPlaceIdIndex = (graph: LocationGraphSnapshot): Map<string, LocationPlace> =>
  new Map(graph.places.map((place) => [place.id, place]));

const buildPlaceNameIndex = (graph: LocationGraphSnapshot): Map<string, LocationPlace> => {
  const map = new Map<string, LocationPlace>();
  for (const place of graph.places) {
    map.set(normalizeName(place.name), place);
  }
  return map;
};

export const resolveParentPlace = (
  anchorPlace: LocationPlace,
  placeById: Map<string, LocationPlace>
): LocationPlace | null => {
  if (!isNonEmptyString(anchorPlace.canonicalParentId)) {
    return null;
  }
  return placeById.get(anchorPlace.canonicalParentId) ?? null;
};

export const normalizeName = (value: string): string => {
  const lower = value.toLowerCase();
  const stripped = lower.replace(/[^a-z0-9]+/g, '');
  if (stripped.length > 0) {
    return stripped;
  }
  return lower.trim();
};

export function buildPromptInput(
  context: PlannerContext,
  gmResponse: string,
  playerIntent: string
): PromptInput {
  const childNames = context.graph.places
    .filter((place) => place.canonicalParentId === context.anchorPlace.id)
    .slice(0, MAX_CHILDREN)
    .map((place) => place.name);
  const adjacentNames = collectNeighborNames(context.graph, context.anchorPlace.id, ['ADJACENT_TO']).slice(
    0,
    MAX_NEIGHBORS
  );
  const linkNames = collectNeighborNames(context.graph, context.anchorPlace.id, [
    'LINKS_TO',
    'DOCKED_TO',
  ]).slice(0, MAX_NEIGHBORS);
  return {
    adjacent: adjacentNames,
    children: childNames,
    current: context.anchorPlace.name,
    currentId: context.anchorPlace.id,
    gmResponse,
    links: linkNames,
    parent: context.parentPlace?.name ?? null,
    playerIntent,
  };
}

const collectNeighborNames = (
  graph: LocationGraphSnapshot,
  anchorId: string,
  kinds: LocationPlanEdge['kind'][]
): string[] => {
  const names: string[] = [];
  for (const edge of graph.edges) {
    if (!kinds.includes(edge.kind)) {
      continue;
    }
    if (edge.src === anchorId) {
      const target = graph.places.find((place) => place.id === edge.dst) ?? null;
      if (target !== null) {
        names.push(target.name);
      }
    } else if (edge.dst === anchorId) {
      const target = graph.places.find((place) => place.id === edge.src) ?? null;
      if (target !== null) {
        names.push(target.name);
      }
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