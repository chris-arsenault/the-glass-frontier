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

export class LocationDeltaNode implements GraphNode {
  readonly id = 'location-delta';
  readonly #graphStore: LocationGraphStore;

  constructor(graphStore: LocationGraphStore) {
    this.#graphStore = graphStore;
  }

  async execute(context: GraphContext): Promise<GraphContext> {
    if (context.failure || !context.gmMessage || !context.chronicle.character?.id) {
      return context;
    }

    try {
      const plan = await this.#buildPlan(context);
      if (!plan || plan.ops.length === 0) {
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

  async #buildPlan(context: GraphContext) {
    const chronicleId = context.chronicleId;
    const locationId = context.chronicle.chronicle.locationId;
    const characterId = context.chronicle.character?.id;
    if (!characterId || !locationId) {
      return null;
    }

    const [graph, priorState] = await Promise.all([
      this.#graphStore.getLocationGraph(locationId),
      this.#graphStore.getLocationState(characterId),
    ]);

    if (!priorState || priorState.locationId !== locationId) {
      return null;
    }

    const anchorPlace = graph.places.find((place) => place.id === priorState.anchorPlaceId) ?? null;
    if (!anchorPlace) {
      return null;
    }

    const placeById = new Map(graph.places.map((place) => [place.id, place]));
    const placeByName = new Map<string, LocationPlace>();
    for (const place of graph.places) {
      placeByName.set(normalizeName(place.name), place);
    }

    const parentPlace = anchorPlace.canonicalParentId
      ? (placeById.get(anchorPlace.canonicalParentId) ?? null)
      : null;

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

    const prompt = await composeLocationDeltaPrompt(context.templates, {
      adjacent: adjacentNames,
      children: childNames,
      current: anchorPlace.name,
      gmResponse: context.gmMessage?.content ?? '',
      links: linkNames,
      parent: parentPlace?.name ?? null,
      playerIntent: context.playerMessage?.content ?? '',
    });

    const llmResult = await context.llm.generateText({
      maxTokens: 400,
      metadata: { chronicleId, nodeId: this.id },
      prompt,
      temperature: 0.1,
    });
    const raw = (llmResult.text ?? '').trim();
    if (!raw) {
      return null;
    }

    let decision: z.infer<typeof decisionSchema>;
    try {
      decision = decisionSchema.parse(JSON.parse(extractJsonLine(raw)));
    } catch (error) {
      log('warn', 'location-delta-node.invalid-json', {
        chronicleId,
        locationId,
        payload: raw,
        reason: error instanceof Error ? error.message : 'unknown',
      });
      return null;
    }

    return this.#decisionToPlan({
      anchorPlace,
      characterId,
      decision,
      parentPlace,
      placeByName,
    });
  }

  #decisionToPlan(input: {
    decision: z.infer<typeof decisionSchema>;
    anchorPlace: LocationPlace;
    parentPlace: LocationPlace | null;
    placeByName: Map<string, LocationPlace>;
    characterId: string;
  }): LocationPlan | null {
    const { anchorPlace, characterId, decision, parentPlace, placeByName } = input;

    if (decision.action === 'no_change') {
      return null;
    }

    if (decision.action === 'uncertain') {
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
      } satisfies LocationPlan;
    }

    const normalized = normalizeName(decision.destination);
    const known = placeByName.get(normalized);

    const ops: LocationPlan['ops'] = [];
    let targetRef: string | undefined = known?.id;

    if (!targetRef) {
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
      targetRef = tempId;
    } else {
      this.#appendEdgesForExistingTarget({
        anchorId: anchorPlace.id,
        link: decision.link,
        ops,
        parentId: parentPlace?.id ?? anchorPlace.id,
        targetId: targetRef,
      });
    }

    if (!targetRef) {
      return null;
    }

    ops.push({ dst_place_id: targetRef, op: 'MOVE' });

    return {
      character_id: characterId,
      notes: `move:${decision.destination}`,
      ops,
    } satisfies LocationPlan;
  }

  #appendEdgesForNewTarget(input: {
    ops: LocationPlan['ops'];
    link: string;
    anchorId: string;
    parentId: string;
    targetId: string;
  }) {
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
    link: string;
    anchorId: string;
    parentId: string;
    targetId: string;
  }) {
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
      const target = graph.places.find((place) => place.id === edge.dst);
      if (target) {names.push(target.name);}
    } else if (edge.dst === anchorId) {
      const target = graph.places.find((place) => place.id === edge.src);
      if (target) {names.push(target.name);}
    }
  }
  return dedupe(names);
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) {continue;}
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
  return `temp-${slug || 'place'}-${Math.random().toString(16).slice(2, 6)}`;
}

function inferKind(link: string): string {
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
