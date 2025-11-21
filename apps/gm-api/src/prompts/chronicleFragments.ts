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
  | 'lore'
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
  'action-resolver': ['recent-events', 'tone', 'intent', 'anchor', 'lore', 'character', 'skill-check', 'location', 'inventory-detail', 'seed'],
  'beat-tracker': ['intent', 'beats', 'lore'],
  'check-planner': ['intent', 'character', 'location', 'lore'],
  'clarification-responder': ['recent-events', 'tone', 'intent', 'anchor', 'lore', 'character', 'location', 'inventory-detail', 'seed'],
  'gm-summary': ['intent', 'character', 'skill-check', 'lore', 'wrap'],
  'inquiry-describer': ['recent-events', 'tone', 'intent', 'character', 'lore', 'location', 'inventory-detail', 'seed'],
  'intent-beat-detector': ['intent', 'beats', 'lore'],
  'intent-classifier': ['character', 'location', 'beats', 'wrap'],
  'inventory-delta': ['intent', 'user-message', 'inventory', 'lore'],
  'location-delta': ['intent', 'user-message', 'location-detail', 'lore'],
  'planning-narrator': ['recent-events', 'tone', 'intent', 'anchor', 'lore', 'character', 'skill-check', 'location', 'inventory-detail', 'seed'],
  'possibility-advisor': ['recent-events', 'tone', 'intent', 'anchor', 'lore', 'character', 'location', 'inventory-detail', 'seed'],
  'reflection-weaver': ['recent-events', 'tone', 'intent', 'anchor', 'lore', 'character', 'location', 'inventory-detail', 'seed'],
  'wrap-resolver': ['recent-events', 'tone', 'intent', 'anchor', 'lore', 'character', 'skill-check', 'location', 'inventory-detail', 'wrap', 'seed'],
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
  lore: loreFragment,
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
        id: entity.id,
        name: entity.name,
        kind: entity.kind,
        subkind: entity.subkind ?? null,
        status: entity.status ?? null,
        description: entity.description ?? null,
        relationships: entity.links?.length ?? 0,
        tags: Array.from(new Set(fragments.flatMap((f) => f.tags ?? []))),
        recentLore: fragments.map((fragment) => ({
          id: fragment.id,
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

function loreFragment(context: GraphContext): Array<{
  id: string;
  title: string;
  summary: string;
  tags: string[];
  entityId: string;
  score: number;
}> {
  return (context.loreContext?.offered ?? []).map((entry) => ({
    id: entry.id,
    title: entry.title,
    summary: entry.summary,
    tags: entry.tags,
    entityId: entry.entityId,
    score: entry.score,
  }));
}

async function locationFragment(context: GraphContext): Promise<Record<string, unknown>> {
  const anchorId =
    context.chronicleState.location?.id ?? context.chronicleState.chronicle.locationId;

  if (!isNonEmptyString(anchorId)) {
    return EMPTY_LOCATION;
  }

  try {
    const details = await context.locationGraphStore.getLocationDetails({
      id: anchorId,
      minProminence: 'recognized',
      maxHops: 2,
    });
    return {
      id: details.place.id,
      name: details.place.name,
      slug: details.place.slug,
      status: details.place.status ?? null,
      description: details.place.description ?? null,
      neighbors: formatLocationNeighbors(details.neighbors),
      tags: details.place.tags ?? [],
    };
  } catch {
    return {
      id: context.chronicleState.location?.id ?? null,
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
    const neighbors = await context.locationGraphStore.getLocationNeighbors({
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
  return formatIntent(context.playerIntent);
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
