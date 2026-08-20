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

const INVENTORY_DETAIL_FRAGMENT: ChronicleFragmentTypes = 'inventory-detail';
const RECENT_EVENTS_FRAGMENT: ChronicleFragmentTypes = 'recent-events';
const SKILL_CHECK_FRAGMENT: ChronicleFragmentTypes = 'skill-check';
const USER_MESSAGE_FRAGMENT: ChronicleFragmentTypes = 'user-message';

// prettier-ignore
export const templateFragmentMapping = new Map<
PromptTemplateId,
ChronicleFragmentTypes[]
>([
  ['action-resolver', [RECENT_EVENTS_FRAGMENT, 'tone', 'intent', 'anchor', 'entities', 'character', SKILL_CHECK_FRAGMENT, 'location', INVENTORY_DETAIL_FRAGMENT, 'seed']],
  ['beat-tracker', ['intent', 'beats']],
  ['check-planner', ['intent', 'character']],
  ['clarification-responder', [RECENT_EVENTS_FRAGMENT, 'tone', 'intent', 'anchor', 'entities', 'character', 'location', INVENTORY_DETAIL_FRAGMENT, 'seed']],
  ['entity-judge', ['entities', 'gm-response']],
  ['gm-summary', ['intent', 'character', SKILL_CHECK_FRAGMENT, 'wrap']],
  ['inquiry-describer', [RECENT_EVENTS_FRAGMENT, 'tone', 'intent', 'character', 'entities', 'location', INVENTORY_DETAIL_FRAGMENT, 'seed']],
  ['intent-beat-detector', ['intent', 'beats']],
  ['intent-classifier', ['character', 'beats', 'wrap']],
  ['inventory-delta', ['intent', USER_MESSAGE_FRAGMENT, 'inventory']],
  ['location-delta', ['intent', USER_MESSAGE_FRAGMENT, 'location-detail']],
  ['planning-narrator', [RECENT_EVENTS_FRAGMENT, 'tone', 'intent', 'anchor', 'entities', 'character', SKILL_CHECK_FRAGMENT, 'location', INVENTORY_DETAIL_FRAGMENT, 'seed']],
  ['possibility-advisor', [RECENT_EVENTS_FRAGMENT, 'tone', 'intent', 'anchor', 'entities', 'character', 'location', INVENTORY_DETAIL_FRAGMENT, 'seed']],
  ['reflection-weaver', [RECENT_EVENTS_FRAGMENT, 'tone', 'intent', 'anchor', 'entities', 'character', 'location', INVENTORY_DETAIL_FRAGMENT, 'seed']],
  ['wrap-resolver', [RECENT_EVENTS_FRAGMENT, 'tone', 'intent', 'anchor', 'entities', 'character', SKILL_CHECK_FRAGMENT, 'location', INVENTORY_DETAIL_FRAGMENT, 'wrap', 'seed']],
]);

type FragmentHandler = (context: GraphContext) => Promise<unknown> | unknown;

const fragmentHandlers = new Map<ChronicleFragmentTypes, FragmentHandler>([
  ['anchor', anchorFragment],
  ['beats', beatsFragment],
  ['character', characterFragment],
  ['entities', entitiesFragment],
  ['gm-response', gmResponseFragment],
  ['intent', intentFragment],
  ['inventory', inventoryFragment],
  [INVENTORY_DETAIL_FRAGMENT, inventoryDetailFragment],
  ['location', locationFragment],
  ['location-detail', locationDetailFragment],
  [RECENT_EVENTS_FRAGMENT, recentEventsFragment],
  ['seed', seedFragment],
  [SKILL_CHECK_FRAGMENT, skillCheckFragment],
  ['tone', toneFragment],
  [USER_MESSAGE_FRAGMENT, userMessageFragment],
  ['wrap', wrapFragment],
]);

export function extractFragment(
  fragmentType: ChronicleFragmentTypes,
  context: GraphContext
): Promise<unknown> | unknown {
  const handler = fragmentHandlers.get(fragmentType);
  if (handler === undefined) {
    throw new Error(`No fragment handler is registered for ${fragmentType}.`);
  }
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
  const entity = await context.worldSchemaStore.getEntity({ id: anchorId });
  if (entity === null) {
    return { anchor: null };
  }
  const fragments = await context.worldSchemaStore.listLoreFragmentsByEntity({
    entityId: anchorId,
    limit: 5,
  });
  return {
    anchor: {
      description: entity.description ?? null,
      kind: entity.kind,
      name: entity.name,
      recentLore: fragments.map((fragment) => ({
        prose: fragment.prose,
        slug: fragment.slug,
        tags: fragment.tags,
        title: fragment.title,
      })),
      relationships: entity.links.length,
      slug: entity.slug,
      status: entity.status ?? null,
      subkind: entity.subkind ?? null,
      tags: Array.from(new Set(fragments.flatMap((fragment) => fragment.tags))),
    },
  };
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
    kind: entry.kind,
    loreFragments: entry.loreFragments,
    name: entry.name,
    slug: entry.slug,
    status: entry.status,
    tags: entry.tags,
  }));
}

async function locationFragment(context: GraphContext): Promise<Record<string, unknown>> {
  const location = context.chronicleState.location;
  if (!isNonEmptyString(location.id)) {
    return EMPTY_LOCATION;
  }
  if (location.status === 'session-only') {
    return {
      description: location.description ?? null,
      name: location.name,
      neighbors: {},
      slug: location.slug,
      status: location.status,
      tags: location.tags,
    };
  }
  const details = await context.locationHelpers.getDetails({
    id: location.id,
    maxHops: 2,
    minProminence: 'recognized',
  });
  return {
    description: details.place.description ?? null,
    name: details.place.name,
    neighbors: formatLocationNeighbors(details.neighbors),
    slug: details.place.slug,
    status: details.place.status ?? null,
    tags: details.place.tags,
  };
}

async function locationDetailFragment(context: GraphContext): Promise<unknown> {
  const location = context.chronicleState.location;
  if (!isNonEmptyString(location.id) || location.status === 'session-only') {
    return EMPTY_LOCATION_DETAIL;
  }
  const neighbors = await context.locationHelpers.getNeighborsGrouped({
    id: location.id,
    maxHops: 2,
    minProminence: 'recognized',
  });
  return formatLocationNeighbors(neighbors);
}

function inventoryFragment(context: GraphContext): Array<Record<string, unknown>> {
  return context.chronicleState.character.inventory.map(formatInventoryItem);
}

function inventoryDetailFragment(context: GraphContext): Array<Record<string, unknown>> {
  return context.chronicleState.character.inventory.map(formatInventoryItemDetail);
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
  const targetEndTurn = context.chronicleState.chronicle.targetEndTurn;
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
