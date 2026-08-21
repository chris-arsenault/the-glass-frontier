import type { PromptTemplateId } from '@glass-frontier/dto';
import { isNonEmptyString } from '@glass-frontier/utils';

import type { GraphContext } from '../types';
import {
  formatCharacter,
  formatIntent,
  formatInventoryItem,
  formatInventoryItemDetail,
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
  ['location-delta', ['intent', USER_MESSAGE_FRAGMENT, 'location']],
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
  const [entity, fragments] = await Promise.all([
    context.worldSchemaStore.getEntity({ id: anchorId }),
    context.worldSchemaStore.listLoreFragmentsByEntity({ entityId: anchorId, limit: 5 }),
  ]);
  if (entity === null) {
    return { anchor: null };
  }
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

/**
 * Where the scene is, as a name. Anything the world knows about the place
 * arrives through the entity slice, which already ranks locations alongside
 * everything else the turn touches.
 */
function locationFragment(context: GraphContext): string {
  return context.chronicleState.locationName;
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
