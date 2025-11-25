/* eslint-disable sonarjs/no-duplicate-string */
import type { PromptTemplateId } from '@glass-frontier/dto';
import { isNonEmptyString } from '@glass-frontier/utils';

import type { GraphContext } from '../types';
import {
  EMPTY_LOCATION,
  EMPTY_LOCATION_DETAIL,
  formatCharacter,
  formatIntent,
  formatInventoryItem,
  formatInventoryItemDetail,
  formatLocationNeighbors,
  formatSkillCheck,
  trimBeatsList,
} from './contextFormaters';

export type ChronicleFragmentTypes =
  | 'character'
  | 'location'
  | 'anchor'
  | 'entities'
  | 'beats'
  | 'intent'
  | 'gm-response'
  | 'skill-check'
  | 'user-message'
  | 'recent-events'
  | 'tone'
  | 'wrap'
  | 'location-detail'
  | 'inventory'
  | 'inventory-detail'
  | 'seed';

// prettier-ignore
export const templateFragmentMapping: Partial<Record<PromptTemplateId, ChronicleFragmentTypes[]>> = {
  'action-resolver': ['recent-events', 'tone', 'intent', 'anchor', 'entities', 'character', 'skill-check', 'location', 'inventory-detail', 'seed'],
  'beat-tracker': ['intent', 'beats'],
  'check-planner': ['intent', 'character'],
  'clarification-responder': ['recent-events', 'tone', 'intent', 'anchor', 'entities', 'character', 'location', 'inventory-detail', 'seed'],
  'entity-judge': ['entities', 'gm-response'],
  'gm-summary': ['intent', 'character', 'skill-check', 'wrap'],
  'inquiry-describer': ['recent-events', 'tone', 'intent', 'character', 'entities', 'location', 'inventory-detail', 'seed'],
  'intent-beat-detector': ['intent', 'beats'],
  'intent-classifier': ['character', 'beats', 'wrap'],
  'inventory-delta': ['intent', 'user-message', 'inventory'],
  'location-delta': ['intent', 'user-message', 'location-detail'],
  'planning-narrator': ['recent-events', 'tone', 'intent', 'anchor', 'entities', 'character', 'skill-check', 'location', 'inventory-detail', 'seed'],
  'possibility-advisor': ['recent-events', 'tone', 'intent', 'anchor', 'entities', 'character', 'location', 'inventory-detail', 'seed'],
  'reflection-weaver': ['recent-events', 'tone', 'intent', 'anchor', 'entities', 'character', 'location', 'inventory-detail', 'seed'],
  'wrap-resolver': ['recent-events', 'tone', 'intent', 'anchor', 'entities', 'character', 'skill-check', 'location', 'inventory-detail', 'wrap', 'seed'],
};

type FragmentHandler = (context: GraphContext) => Promise<unknown> | unknown;

const fragmentHandlers: Record<ChronicleFragmentTypes, FragmentHandler> = {
  beats: beatsFragment,
  character: characterFragment,
  'gm-response': gmResponseFragment,
  intent: intentFragment,
  inventory: inventoryFragment,
  'inventory-detail': inventoryDetailFragment,
  anchor: anchorFragment,
  entities: entitiesFragment,
  location: locationFragment,
  'location-detail': locationDetailFragment,
  'recent-events': recentEventsFragment,
  seed: seedFragment,
  'skill-check': skillCheckFragment,
  tone: toneFragment,
  'user-message': userMessageFragment,
  wrap: wrapFragment,
};

export function extractFragment(
  fragmentType: ChronicleFragmentTypes,
  context: GraphContext
): Promise<unknown> | unknown {
  // eslint-disable-next-line securityPlugin/detect-object-injection
  const handler = fragmentHandlers[fragmentType];
  return handler(context);
}

function userMessageFragment(context: GraphContext): string {
  return context.playerMessage.content;
}

function characterFragment(context: GraphContext): Record<string, unknown> {
  return formatCharacter(context.chronicleState.character);
}

async function anchorFragment(context: GraphContext): Promise<Record<string, unknown>> {
  const anchorId = context.chronicleState.chronicle.anchorEntityId;
  if (!isNonEmptyString(anchorId)) {
    return { anchor: null };
  }
  try {
    const entity = await context.worldSchemaStore.getEntity({ id: anchorId });
    if (!entity) {
      return { anchor: null };
    }
    const fragments = await context.worldSchemaStore.listLoreFragmentsByEntity({
      entityId: anchorId,
      limit: 5,
    });
    return {
      anchor: {
        slug: entity.slug,
        name: entity.name,
        kind: entity.kind,
        subkind: entity.subkind ?? null,
        status: entity.status ?? null,
        description: entity.description ?? null,
        relationships: entity.links?.length ?? 0,
        tags: Array.from(new Set(fragments.flatMap((f) => f.tags ?? []))),
        recentLore: fragments.map((fragment) => ({
          slug: fragment.slug,
          title: fragment.title,
          tags: fragment.tags ?? [],
          prose: fragment.prose,
        })),
      },
    };
  } catch {
    return { anchor: null };
  }
}

function entitiesFragment(context: GraphContext): Array<{
  slug: string;
  name: string;
  kind: string;
  status: string | undefined;
  tags: string[];
  loreFragments: Array<{
    slug: string;
    title: string;
    summary: string;
    tags: string[];
  }>;
}> {
  return (context.entityContext?.offered ?? []).map((entry) => ({
    slug: entry.slug,
    name: entry.name,
    kind: entry.kind,
    status: entry.status,
    tags: entry.tags,
    loreFragments: entry.loreFragments,
  }));
}

async function locationFragment(context: GraphContext): Promise<Record<string, unknown>> {
  const anchorId =
    context.chronicleState.location?.id ?? context.chronicleState.chronicle.locationId;

  if (!isNonEmptyString(anchorId)) {
    return EMPTY_LOCATION;
  }

  try {
    const details = await context.locationHelpers.getDetails({
      id: anchorId,
      minProminence: 'recognized',
      maxHops: 2,
    });
    return {
      name: details.place.name,
      slug: details.place.slug,
      status: details.place.status ?? null,
      description: details.place.description ?? null,
      neighbors: formatLocationNeighbors(details.neighbors),
      tags: details.place.tags ?? [],
    };
  } catch {
    return {
      name: context.chronicleState.location?.name ?? null,
      slug: context.chronicleState.location?.slug ?? null,
      status: context.chronicleState.location?.status ?? null,
      description: context.chronicleState.location?.description ?? null,
      neighbors: {},
      tags: context.chronicleState.location?.tags ?? [],
    };
  }
}

async function locationDetailFragment(context: GraphContext): Promise<unknown> {
  const anchorId =
    context.chronicleState.location?.id ?? context.chronicleState.chronicle.locationId;

  if (!isNonEmptyString(anchorId)) {
    return EMPTY_LOCATION_DETAIL;
  }

  try {
    const neighbors = await context.locationHelpers.getNeighborsGrouped({
      id: anchorId,
      minProminence: 'recognized',
      maxHops: 2,
    });
    return formatLocationNeighbors(neighbors);
  } catch {
    return EMPTY_LOCATION_DETAIL;
  }
}

function inventoryFragment(context: GraphContext): Array<Record<string, unknown>> {
  return (context.chronicleState.character?.inventory ?? []).map(formatInventoryItem);
}

function inventoryDetailFragment(context: GraphContext): Array<Record<string, unknown>> {
  return (context.chronicleState.character?.inventory ?? []).map(formatInventoryItemDetail);
}

function beatsFragment(context: GraphContext): unknown {
  return trimBeatsList(context.chronicleState.chronicle.beats);
}

function intentFragment(context: GraphContext): Record<string, unknown> {
  return formatIntent(context.playerIntent, context.chronicleState.chronicle.beats);
}

function toneFragment(context: GraphContext): string {
  return `*IMPORTANT*: ${context.playerIntent?.tone}`;
}

function skillCheckFragment(context: GraphContext): Record<string, unknown> {
  return formatSkillCheck(context.skillCheckPlan, context.skillCheckResult);
}

function gmResponseFragment(context: GraphContext): string | undefined {
  return context.gmResponse?.content;
}

function recentEventsFragment(context: GraphContext): string {
  return context.chronicleState.turns
    .slice(-10)
    .map(
      (turn, index) =>
        `${index + 1} P: ${turn.playerIntent?.intentSummary ?? ''}\n   G: ${turn.gmSummary ?? ''}`
    )
    .join('\n');
}

function wrapFragment(context: GraphContext): Record<string, number> | string {
  const targetEndTurn = context.chronicleState.chronicle?.targetEndTurn;
  if (targetEndTurn === undefined || targetEndTurn === null) {
    return '';
  }
  return {
    turnsLeft: targetEndTurn - context.turnSequence,
  };
}

function seedFragment(context: GraphContext): string | undefined {
  return context.chronicleState.chronicle.seedText;
}
