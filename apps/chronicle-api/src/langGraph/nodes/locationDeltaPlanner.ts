import type {
  LocationGraphSnapshot,
  LocationPlan,
  LocationPlanEdge,
  LocationPlace,
} from '@glass-frontier/dto';

const MAX_CHILDREN = 25;
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
  anchorPlace: LocationPlace;
  characterId: string;
  chronicleId: string;
  graph: LocationGraphSnapshot;
  parentPlace: LocationPlace | null;
  placeById: Map<string, LocationPlace>;
  placeByName: Map<string, LocationPlace>;
};

export type PlanBuildResult = {
  applyImmediately: boolean;
  plan: LocationPlan;
};

export type TargetResolution = {
  applyImmediately: boolean;
  id: string;
};

export function buildPlannerContext(input: {
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

export function decisionToPlan(context: PlannerContext, decision: DeltaDecision): PlanBuildResult | null {
  if (decision.action === 'no_change') {
    return null;
  }
  if (decision.action === 'uncertain') {
    return {
      applyImmediately: false,
      plan: buildUncertainPlan(context.characterId),
    };
  }
  const ops: LocationPlan['ops'] = [];
  const target = resolveTargetReference({
    context,
    decision,
    ops,
  });
  if (target === null) {
    return null;
  }
  ops.push({ dst_place_id: target.id, op: 'MOVE' });
  return {
    applyImmediately: target.applyImmediately,
    plan: finalizeMovePlan(context.characterId, decision.destination, ops),
  };
}

export function resolveTargetReference(input: {
  context: PlannerContext;
  decision: DeltaDecision;
  ops: LocationPlan['ops'];
}): TargetResolution | null {
  const { anchorPlace, parentPlace, placeById, placeByName } = input.context;
  const known = placeByName.get(normalizeName(input.decision.destination)) ?? null;

  if (known !== null) {
    const ancestorTarget =
      known.id === anchorPlace.id || isAncestor(placeById, anchorPlace.id, known.id);
    if (!ancestorTarget) {
      appendEdgesForExistingTarget({
        anchorId: anchorPlace.id,
        link: input.decision.link,
        ops: input.ops,
        parentId: parentPlace?.id ?? anchorPlace.id,
        target: known,
      });
    }
    return { applyImmediately: ancestorTarget, id: known.id };
  }

  const tempId = createTempId(input.decision.destination);
  input.ops.push({
    op: 'CREATE_PLACE',
    place: {
      kind: inferKind(input.decision.link),
      name: input.decision.destination,
      tags: [],
      temp_id: tempId,
    },
  });
  appendEdgesForNewTarget({
    anchorId: anchorPlace.id,
    link: input.decision.link,
    ops: input.ops,
    parentId: parentPlace?.id ?? anchorPlace.id,
    targetId: tempId,
  });
  return { applyImmediately: false, id: tempId };
}

export function appendEdgesForExistingTarget(input: {
  anchorId: string;
  link: DeltaDecision['link'];
  ops: LocationPlan['ops'];
  parentId: string;
  target: LocationPlace;
}): void {
  const { anchorId, link, ops, parentId, target } = input;
  switch (link) {
  case 'inside':
    ops.push({ edge: buildEdge(anchorId, target.id, 'CONTAINS'), op: 'CREATE_EDGE' });
    break;
  case 'adjacent':
    ops.push({
      edge: buildEdge(anchorId, target.id, 'ADJACENT_TO'),
      op: 'CREATE_EDGE',
    });
    break;
  case 'linked':
    ops.push({ edge: buildEdge(anchorId, target.id, 'LINKS_TO'), op: 'CREATE_EDGE' });
    break;
  default:
    ops.push({ edge: buildEdge(parentId, target.id, 'CONTAINS'), op: 'CREATE_EDGE' });
    break;
  }
}

function appendEdgesForNewTarget(input: {
  anchorId: string;
  link: DeltaDecision['link'];
  ops: LocationPlan['ops'];
  parentId: string;
  targetId: string;
}): void {
  const { anchorId, link, ops, parentId, targetId } = input;
  switch (link) {
  case 'inside':
    ops.push({ edge: buildEdge(anchorId, targetId, 'CONTAINS'), op: 'CREATE_EDGE' });
    break;
  case 'adjacent':
    ops.push({ edge: buildEdge(parentId, targetId, 'CONTAINS'), op: 'CREATE_EDGE' });
    ops.push({
      edge: buildEdge(anchorId, targetId, 'ADJACENT_TO'),
      op: 'CREATE_EDGE',
    });
    break;
  case 'linked':
    ops.push({ edge: buildEdge(anchorId, targetId, 'LINKS_TO'), op: 'CREATE_EDGE' });
    break;
  default:
    ops.push({
      edge: buildEdge(anchorId, targetId, 'ADJACENT_TO'),
      op: 'CREATE_EDGE',
    });
    break;
  }
}

const buildEdge = (
  src: string,
  dst: string,
  kind: LocationPlanEdge['kind']
): LocationPlanEdge => ({
  dst,
  kind,
  src,
});

const isNonEmptyString = (value?: string | null): value is string =>
  typeof value === 'string' && value.trim().length > 0;

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

const findAnchorPlace = (
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

const resolveParentPlace = (
  anchorPlace: LocationPlace,
  placeById: Map<string, LocationPlace>
): LocationPlace | null => {
  if (!isNonEmptyString(anchorPlace.canonicalParentId)) {
    return null;
  }
  return placeById.get(anchorPlace.canonicalParentId) ?? null;
};

const buildUncertainPlan = (characterId: string): LocationPlan => ({
  character_id: characterId,
  notes: 'location-uncertain',
  ops: [
    {
      certainty: 'unknown',
      note: 'GM response ambiguous',
      op: 'SET_CERTAINTY',
    },
  ],
});

const finalizeMovePlan = (
  characterId: string,
  destination: string,
  ops: LocationPlan['ops']
): LocationPlan => ({
  character_id: characterId,
  notes: `move:${destination}`,
  ops,
});

export const collectNeighborNames = (
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

export const normalizeName = (value: string): string => {
  const lower = value.toLowerCase();
  const stripped = lower.replace(/[^a-z0-9]+/g, '');
  if (stripped.length > 0) {
    return stripped;
  }
  return lower.trim();
};

const createTempId = (name: string): string => {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  const normalizedSlug = slug.length > 0 ? slug : 'place';
  const suffix = Math.random().toString(16).slice(2, 6);
  return `temp-${normalizedSlug}-${suffix}`;
};

const inferKind = (link: DeltaDecision['link']): string => {
  switch (link) {
  case 'inside':
    return 'room';
  case 'linked':
    return 'structure';
  default:
    return 'locale';
  }
};

export const isAncestor = (
  placeById: Map<string, LocationPlace>,
  descendantId: string,
  ancestorId: string
): boolean => {
  const visited = new Set<string>();
  let cursorId: string | null = descendantId;
  while (cursorId !== null) {
    if (cursorId === ancestorId) {
      return true;
    }
    const place = placeById.get(cursorId);
    if (place === undefined) {
      return false;
    }
    const parentId = place.canonicalParentId ?? null;
    if (parentId === null) {
      return false;
    }
    if (visited.has(parentId)) {
      return false;
    }
    visited.add(parentId);
    cursorId = parentId;
  }
  return false;
};
