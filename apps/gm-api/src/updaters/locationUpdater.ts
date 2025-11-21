import type { LocationPlace, LocationPlan, LocationPlanEdge } from '@glass-frontier/dto';
import type { LocationDeltaDecision } from '@glass-frontier/gm-api/gmGraph/nodes/classifiers/LocationDeltaNode';
import {
  normalizeName,
  type PlannerContext,
  resolvePlanContext,
} from '@glass-frontier/gm-api/prompts/locationHelpers';
import { isNonEmptyString, log } from '@glass-frontier/utils';

import type { GraphContext } from '../types';

export async function createLocationPlan(context: GraphContext): Promise<LocationPlan> {
  log('info', 'Updating Location');
  const plan: LocationPlan = {
    characterId: '',
    notes: '',
    ops: [],
  };

  const characterId = context.chronicleState.chronicle.characterId;
  const delta = context.locationDelta;
  const plannerContext = await resolvePlanContext(context);

  if (!isNonEmptyString(characterId) || delta === undefined || delta === null || plannerContext === null) {
    return plan;
  }

  plan.characterId = characterId;

  const targetId = resolveTargetReference({
    context: plannerContext,
    delta,
    plan,
  });

  if (!isNonEmptyString(targetId)) {
    return plan;
  }

  plan.ops.push({ dst_place_id: targetId, op: 'MOVE' });

  return finalizeMovePlan(characterId, delta.destination, plan.ops);
}

export function resolveTargetReference(input: {
  context: PlannerContext;
  delta: LocationDeltaDecision;
  plan: LocationPlan;
}): string {
  const { anchorPlace, parentPlaceId, placeById, placeByName } = input.context;
  const resolvedParentId = parentPlaceId ?? anchorPlace.id;
  const known = placeByName.get(normalizeName(input.delta.destination)) ?? null;

  if (known !== null) {
    const ancestorTarget =
      known.id === anchorPlace.id || isAncestor(placeById, anchorPlace.id, known.id);
    if (!ancestorTarget) {
      appendEdgesForExistingTarget({
        anchorId: anchorPlace.id,
        link: input.delta.link,
        ops: input.plan.ops,
        parentId: resolvedParentId,
        target: known,
      });
    }
    return known.id;
  }

  const tempId = createTempId(input.delta.destination);
  input.plan.ops.push({
    op: 'CREATE_PLACE',
    place: {
      kind: inferKind(input.delta.link),
      name: input.delta.destination,
      tags: [],
      temp_id: tempId,
    },
  });
  appendEdgesForNewTarget({
    anchorId: anchorPlace.id,
    link: input.delta.link,
    ops: input.plan.ops,
    parentId: resolvedParentId,
    targetId: tempId,
  });

  return tempId;
}

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

export function appendEdgesForExistingTarget(input: {
  anchorId: string;
  link: LocationDeltaDecision['link'];
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
  link: LocationDeltaDecision['link'];
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

const inferKind = (link: LocationDeltaDecision['link']): string => {
  switch (link) {
  case 'inside':
    return 'room';
  case 'linked':
    return 'structure';
  default:
    return 'locale';
  }
};
