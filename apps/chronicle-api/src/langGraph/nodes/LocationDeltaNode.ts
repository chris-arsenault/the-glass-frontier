import type {
  LocationPlan } from '@glass-frontier/dto';
import {
  type LocationEdgeKind,
  type LocationGraphSnapshot,
  type LocationPlace,
} from '@glass-frontier/dto';
import type { LocationGraphStore } from '@glass-frontier/persistence';
import { log } from '@glass-frontier/utils';
import { z } from 'zod';

import type { GraphContext } from '../../types';
import type { GraphNode } from '../orchestrator';
import { composeLocationDeltaPrompt } from '../prompts/prompts';

const decisionSchema = z.object({
  action: z.enum(['no_change', 'move', 'uncertain']),
  destination: z.string().min(1),
  link: z.enum(['same', 'adjacent', 'inside', 'linked']),
});

const MAX_CHILDREN = 25;
const MAX_NEIGHBORS = 25;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

type Decision = z.infer<typeof decisionSchema>;

type PromptInput = {
  adjacent: string[];
  children: string[];
  current: string;
  currentId: string;
  gmResponse: string;
  links: string[];
  parent: string | null;
  playerIntent: string;
};

type PlanContext = {
  anchorPlace: LocationPlace;
  parentPlace: LocationPlace | null;
  placeByName: Map<string, LocationPlace>;
  characterId: string;
  graph: LocationGraphSnapshot;
  chronicleId: string;
};

type PriorState = {
  anchorPlaceId: string;
  locationId: string;
};

export class LocationDeltaNode implements GraphNode {
  readonly id = 'location-delta';
  readonly #graphStore: LocationGraphStore;

  constructor(graphStore: LocationGraphStore) {
    this.#graphStore = graphStore;
  }

  async execute(context: GraphContext): Promise<GraphContext> {
    const gmMessageContent = context.gmMessage?.content;
    const characterId = context.chronicle.character?.id;
    if (!this.#isRunnable(context, gmMessageContent, characterId)) {
      return context;
    }

    try {
      const plan = await this.#buildPlan(context);
      if (plan === null || plan.ops.length === 0) {
        return context;
      }
      return { ...context, locationPlan: plan };
    } catch (error) {
      log('warn', 'location-delta-node.failed', {
        chronicleId: context.chronicleId,
        reason: error instanceof Error ? error.message : 'unknown',
      });
      return context;
    }
  }

  async #buildPlan(context: GraphContext): Promise<LocationPlan | null> {
    const planContext = await this.#resolvePlanContext(context);
    if (planContext === null) {
      return null;
    }

    const promptInput = this.#buildPromptInput(context, planContext);
    const prompt = await composeLocationDeltaPrompt(context.templates, promptInput);
    const decision = await this.#requestDecision(context, promptInput.currentId, prompt);
    if (decision === null) {
      return null;
    }

    return this.#decisionToPlan({
      ...planContext,
      decision,
    });
  }

  async #resolvePlanContext(context: GraphContext): Promise<PlanContext | null> {
    const locationId = context.chronicle.chronicle.locationId;
    const characterId = context.chronicle.character?.id;
    if (!isNonEmptyString(characterId) || !isNonEmptyString(locationId)) {
      return null;
    }
    const [graph, priorState] = await Promise.all([
      this.#graphStore.getLocationGraph(locationId),
      this.#graphStore.getLocationState(characterId),
    ]);
    if (!this.#isValidPriorState(priorState, locationId)) {
      return null;
    }
    const anchorPlace = this.#findAnchorPlace(graph, priorState.anchorPlaceId);
    if (anchorPlace === null) {
      return null;
    }
    const placeById = this.#buildPlaceIdIndex(graph);
    const placeByName = this.#buildPlaceNameIndex(graph);
    const parentPlace = this.#resolveParentPlace(anchorPlace, placeById);
    return {
      anchorPlace,
      characterId,
      chronicleId: context.chronicleId,
      graph,
      parentPlace,
      placeByName,
    };
  }

  #isValidPriorState(state: unknown, locationId: string): state is PriorState {
    if (
      state === null ||
      state === undefined ||
      typeof (state as { locationId?: unknown }).locationId !== 'string' ||
      typeof (state as { anchorPlaceId?: unknown }).anchorPlaceId !== 'string'
    ) {
      return false;
    }
    return (state as { locationId: string }).locationId === locationId;
  }

  #findAnchorPlace(graph: LocationGraphSnapshot, anchorPlaceId: string): LocationPlace | null {
    const place = graph.places.find((entry) => entry.id === anchorPlaceId);
    return place ?? null;
  }

  #buildPlaceIdIndex(graph: LocationGraphSnapshot): Map<string, LocationPlace> {
    return new Map(graph.places.map((place) => [place.id, place]));
  }

  #buildPlaceNameIndex(graph: LocationGraphSnapshot): Map<string, LocationPlace> {
    const map = new Map<string, LocationPlace>();
    for (const place of graph.places) {
      map.set(normalizeName(place.name), place);
    }
    return map;
  }

  #resolveParentPlace(
    anchorPlace: LocationPlace,
    placeById: Map<string, LocationPlace>
  ): LocationPlace | null {
    if (!isNonEmptyString(anchorPlace.canonicalParentId)) {
      return null;
    }
    return placeById.get(anchorPlace.canonicalParentId) ?? null;
  }

  #buildPromptInput(context: GraphContext, planContext: PlanContext): PromptInput {
    const { anchorPlace, graph, parentPlace } = planContext;
    const childNames = graph.places
      .filter((place) => place.canonicalParentId === anchorPlace.id)
      .slice(0, MAX_CHILDREN)
      .map((place) => place.name);
    const adjacentNames = collectNeighborNames(graph, anchorPlace.id, ['ADJACENT_TO']).slice(
      0,
      MAX_NEIGHBORS
    );
    const linkNames = collectNeighborNames(graph, anchorPlace.id, ['LINKS_TO', 'DOCKED_TO']).slice(
      0,
      MAX_NEIGHBORS
    );
    return {
      adjacent: adjacentNames,
      children: childNames,
      current: anchorPlace.name,
      currentId: anchorPlace.id,
      gmResponse: context.gmMessage?.content ?? '',
      links: linkNames,
      parent: parentPlace?.name ?? null,
      playerIntent: context.playerMessage?.content ?? '',
    };
  }

  async #requestDecision(
    context: GraphContext,
    locationId: string,
    prompt: string
  ): Promise<Decision | null> {
    const llmResult = await context.llm.generateText({
      maxTokens: 400,
      metadata: { chronicleId: context.chronicleId, nodeId: this.id },
      prompt,
      temperature: 0.1,
    });
    const raw = (llmResult.text ?? '').trim();
    if (raw.length === 0) {
      return null;
    }
    try {
      return decisionSchema.parse(JSON.parse(extractJsonLine(raw)));
    } catch (error) {
      log('warn', 'location-delta-node.invalid-json', {
        chronicleId: context.chronicleId,
        locationId,
        payload: raw,
        reason: error instanceof Error ? error.message : 'unknown',
      });
      return null;
    }
  }

  #decisionToPlan(
    input: PlanContext & {
      decision: Decision;
    }
  ): LocationPlan | null {
    const { characterId, decision } = input;

    if (decision.action === 'no_change') {
      return null;
    }

    if (decision.action === 'uncertain') {
      return this.#buildUncertainPlan(characterId);
    }

    const ops: LocationPlan['ops'] = [];
    const targetRef = this.#resolveTargetReference(input, ops);

    if (targetRef === null) {
      return null;
    }

    ops.push({ dst_place_id: targetRef, op: 'MOVE' });

    return this.#finalizeMovePlan(characterId, decision.destination, ops);
  }

  #buildUncertainPlan(characterId: string): LocationPlan {
    return {
      character_id: characterId,
      notes: 'location-uncertain',
      ops: [
        {
          certainty: 'unknown',
          note: 'GM response ambiguous',
          op: 'SET_CERTAINTY',
        },
      ],
    };
  }

  #finalizeMovePlan(
    characterId: string,
    destination: string,
    ops: LocationPlan['ops']
  ): LocationPlan {
    return {
      character_id: characterId,
      notes: `move:${destination}`,
      ops,
    };
  }

  #resolveTargetReference(
    input: PlanContext & { decision: Decision },
    ops: LocationPlan['ops']
  ): string | null {
    const { anchorPlace, decision, parentPlace, placeByName } = input;
    const known = placeByName.get(normalizeName(decision.destination)) ?? null;

    if (known !== null) {
      this.#appendEdgesForExistingTarget({
        anchorId: anchorPlace.id,
        link: decision.link,
        ops,
        parentId: parentPlace?.id ?? anchorPlace.id,
        targetId: known.id,
      });
      return known.id;
    }

    const tempId = createTempId(decision.destination);
    ops.push({
      op: 'CREATE_PLACE',
      place: {
        kind: inferKind(decision.link),
        name: decision.destination,
        tags: [],
        temp_id: tempId,
      },
    });
    this.#appendEdgesForNewTarget({
      anchorId: anchorPlace.id,
      link: decision.link,
      ops,
      parentId: parentPlace?.id ?? anchorPlace.id,
      targetId: tempId,
    });
    return tempId;
  }

  #appendEdgesForNewTarget(input: {
    ops: LocationPlan['ops'];
    link: Decision['link'];
    anchorId: string;
    parentId: string;
    targetId: string;
  }): void {
    const { anchorId, link, ops, parentId, targetId } = input;
    switch (link) {
    case 'inside':
      ops.push({ edge: { dst: targetId, kind: 'CONTAINS', src: anchorId }, op: 'CREATE_EDGE' });
      break;
    case 'adjacent':
      ops.push({ edge: { dst: targetId, kind: 'CONTAINS', src: parentId }, op: 'CREATE_EDGE' });
      ops.push({
        edge: { dst: targetId, kind: 'ADJACENT_TO', src: anchorId },
        op: 'CREATE_EDGE',
      });
      break;
    case 'linked':
      ops.push({ edge: { dst: targetId, kind: 'LINKS_TO', src: anchorId }, op: 'CREATE_EDGE' });
      break;
    default:
      ops.push({
        edge: { dst: targetId, kind: 'ADJACENT_TO', src: anchorId },
        op: 'CREATE_EDGE',
      });
      break;
    }
  }

  #appendEdgesForExistingTarget(input: {
    ops: LocationPlan['ops'];
    link: Decision['link'];
    anchorId: string;
    parentId: string;
    targetId: string;
  }): void {
    const { anchorId, link, ops, parentId, targetId } = input;
    switch (link) {
    case 'inside':
      ops.push({ edge: { dst: targetId, kind: 'CONTAINS', src: anchorId }, op: 'CREATE_EDGE' });
      break;
    case 'adjacent':
      ops.push({
        edge: { dst: targetId, kind: 'ADJACENT_TO', src: anchorId },
        op: 'CREATE_EDGE',
      });
      break;
    case 'linked':
      ops.push({ edge: { dst: targetId, kind: 'LINKS_TO', src: anchorId }, op: 'CREATE_EDGE' });
      break;
    default:
      ops.push({ edge: { dst: targetId, kind: 'CONTAINS', src: parentId }, op: 'CREATE_EDGE' });
      break;
    }
  }

  #shouldApplyDelta(context: GraphContext): boolean {
    const type = context.resolvedIntentType ?? context.playerIntent?.intentType;
    return type === 'action' || type === 'planning';
  }

  #isRunnable(
    context: GraphContext,
    gmMessageContent?: string | null,
    characterId?: string | null
  ): boolean {
    return (
      context.failure !== true &&
      this.#shouldApplyDelta(context) &&
      isNonEmptyString(gmMessageContent) &&
      isNonEmptyString(characterId)
    );
  }
}

function collectNeighborNames(
  graph: LocationGraphSnapshot,
  anchorId: string,
  kinds: LocationEdgeKind[]
): string[] {
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
}

function dedupe(values: string[]): string[] {
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
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function createTempId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  const normalizedSlug = slug.length > 0 ? slug : 'place';
  const suffix = Math.random().toString(16).slice(2, 6);
  return `temp-${normalizedSlug}-${suffix}`;
}

function inferKind(link: Decision['link']): string {
  switch (link) {
  case 'inside':
    return 'room';
  case 'linked':
    return 'structure';
  default:
    return 'locale';
  }
}

function extractJsonLine(raw: string): string {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return raw;
  }
  return raw.slice(start, end + 1);
}
