import type { GmNote, PromptTemplateId } from '@glass-frontier/dto';
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
  | 'entity-references'
  | 'beats'
  | 'intent'
  | 'skill-check'
  | 'user-message'
  | 'recent-events'
  | 'tone'
  | 'chronicle-tone'
  | 'wrap'
  | 'inventory'
  | 'inventory-detail'
  | 'scene'
  | 'seed';

const CHRONICLE_TONE_FRAGMENT: ChronicleFragmentTypes = 'chronicle-tone';
const ENTITY_REFERENCES_FRAGMENT: ChronicleFragmentTypes = 'entity-references';
const INVENTORY_DETAIL_FRAGMENT: ChronicleFragmentTypes = 'inventory-detail';
const RECENT_EVENTS_FRAGMENT: ChronicleFragmentTypes = 'recent-events';
const SKILL_CHECK_FRAGMENT: ChronicleFragmentTypes = 'skill-check';
const USER_MESSAGE_FRAGMENT: ChronicleFragmentTypes = 'user-message';

// prettier-ignore
export const templateFragmentMapping = new Map<
PromptTemplateId,
ChronicleFragmentTypes[]
>([
  ['action-resolver', [RECENT_EVENTS_FRAGMENT, 'tone', CHRONICLE_TONE_FRAGMENT, 'intent', 'scene', 'anchor', 'entities', ENTITY_REFERENCES_FRAGMENT, 'character', SKILL_CHECK_FRAGMENT, 'location', INVENTORY_DETAIL_FRAGMENT, 'seed']],
  ['beat-tracker', [RECENT_EVENTS_FRAGMENT, 'intent', 'beats']],
  ['check-planner', [RECENT_EVENTS_FRAGMENT, 'intent', 'scene', ENTITY_REFERENCES_FRAGMENT, 'character', 'location']],
  ['clarification-responder', [RECENT_EVENTS_FRAGMENT, 'tone', CHRONICLE_TONE_FRAGMENT, 'intent', 'scene', 'anchor', 'entities', ENTITY_REFERENCES_FRAGMENT, 'character', 'location', INVENTORY_DETAIL_FRAGMENT, 'seed']],
  ['entity-judge', ['entities', ENTITY_REFERENCES_FRAGMENT]],
  ['gm-summary', [RECENT_EVENTS_FRAGMENT, 'intent', 'scene', 'beats', 'character', SKILL_CHECK_FRAGMENT, 'wrap']],
  ['inquiry-describer', [RECENT_EVENTS_FRAGMENT, 'tone', CHRONICLE_TONE_FRAGMENT, 'intent', 'scene', 'character', 'entities', ENTITY_REFERENCES_FRAGMENT, 'location', INVENTORY_DETAIL_FRAGMENT, 'seed']],
  ['intent-beat-detector', [RECENT_EVENTS_FRAGMENT, 'intent', 'beats']],
  ['intent-classifier', [RECENT_EVENTS_FRAGMENT, 'scene', 'character', 'beats', 'wrap']],
  ['inventory-delta', ['intent', USER_MESSAGE_FRAGMENT, 'inventory']],
  ['location-delta', ['intent', USER_MESSAGE_FRAGMENT, 'location']],
  ['planning-narrator', [RECENT_EVENTS_FRAGMENT, 'tone', CHRONICLE_TONE_FRAGMENT, 'intent', 'scene', 'anchor', 'entities', ENTITY_REFERENCES_FRAGMENT, 'character', SKILL_CHECK_FRAGMENT, 'location', INVENTORY_DETAIL_FRAGMENT, 'seed']],
  ['possibility-advisor', [RECENT_EVENTS_FRAGMENT, 'tone', CHRONICLE_TONE_FRAGMENT, 'intent', 'scene', 'anchor', 'entities', ENTITY_REFERENCES_FRAGMENT, 'character', 'location', INVENTORY_DETAIL_FRAGMENT, 'seed']],
  ['reflection-weaver', [RECENT_EVENTS_FRAGMENT, 'tone', CHRONICLE_TONE_FRAGMENT, 'intent', 'scene', 'anchor', 'entities', ENTITY_REFERENCES_FRAGMENT, 'character', 'location', INVENTORY_DETAIL_FRAGMENT, 'seed']],
  ['wrap-resolver', [RECENT_EVENTS_FRAGMENT, 'tone', CHRONICLE_TONE_FRAGMENT, 'intent', 'scene', 'anchor', 'entities', ENTITY_REFERENCES_FRAGMENT, 'character', SKILL_CHECK_FRAGMENT, 'location', INVENTORY_DETAIL_FRAGMENT, 'wrap', 'seed']],
]);

type FragmentHandler = (context: GraphContext) => Promise<unknown> | unknown;

const fragmentHandlers = new Map<ChronicleFragmentTypes, FragmentHandler>([
  ['anchor', anchorFragment],
  ['beats', beatsFragment],
  ['character', characterFragment],
  [CHRONICLE_TONE_FRAGMENT, chronicleToneFragment],
  ['entities', entitiesFragment],
  [ENTITY_REFERENCES_FRAGMENT, entityReferencesFragment],
  ['intent', intentFragment],
  ['inventory', inventoryFragment],
  [INVENTORY_DETAIL_FRAGMENT, inventoryDetailFragment],
  ['location', locationFragment],
  [RECENT_EVENTS_FRAGMENT, recentEventsFragment],
  ['scene', sceneFragment],
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

async function characterFragment(context: GraphContext): Promise<Record<string, unknown>> {
  const character = context.chronicleState.character;
  const { allegianceId, cultureId, homelandId, speciesId } = character.origin;
  const entities = await context.worldSchemaStore.listEntitiesByIds([
    speciesId,
    cultureId,
    homelandId,
    allegianceId,
  ]);
  const names = new Map(entities.map((entity) => [entity.id, entity.name]));
  return formatCharacter(character, {
    allegiance: names.get(allegianceId),
    culture: names.get(cultureId),
    homeland: names.get(homelandId),
    species: names.get(speciesId),
  });
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

type EstablishedEntity = {
  slug: string;
  name: string;
  kind: string;
  description: string | undefined;
  facts: Record<string, string | number>;
  status: string | undefined;
  tags: string[];
  loreFragments: Array<{
    slug: string;
    title: string;
    summary: string;
    tags: string[];
  }>;
  gmNotes: GmNote[];
};

/**
 * A veiled shell: a hook line and nothing else. Its description, its single
 * lore fragment, and its veil tagline are all the same sentence, so sending
 * the established shape would repeat one line three times and read as settled
 * canon. The GM gets the hook and the flag instead.
 */
type UnwrittenEntity = {
  slug: string;
  name: string;
  kind: string;
  hook: string | undefined;
  unwritten: true;
};

function entitiesFragment(context: GraphContext): Array<EstablishedEntity | UnwrittenEntity> {
  return (context.entityContext?.offered ?? []).map((entry) =>
    entry.unwritten
      ? {
        hook: entry.description,
        kind: entry.kind,
        name: entry.name,
        slug: entry.slug,
        unwritten: true as const,
      }
      : {
        description: entry.description,
        facts: entry.facts,
        gmNotes: entry.gmNotes,
        kind: entry.kind,
        loreFragments: entry.loreFragments,
        name: entry.name,
        slug: entry.slug,
        status: entry.status,
        tags: entry.tags,
      }
  );
}

function entityReferencesFragment(context: GraphContext): Array<Record<string, unknown>> {
  return (context.entityReferences ?? []).map((reference) => ({
    entityId: reference.entityId,
    entitySlug: reference.entitySlug,
    method: reference.method,
    speaker: reference.speaker,
    text: reference.span?.text ?? null,
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
  return {
    currentTurn: context.turnSequence,
    openBeats: trimBeatsList(context.chronicleState.chronicle.beats),
  };
}

function intentFragment(context: GraphContext): Record<string, unknown> {
  return formatIntent(context.playerIntent, context.chronicleState.chronicle.beats);
}

function sceneFragment(context: GraphContext): unknown {
  return context.effectiveScene;
}

function toneFragment(context: GraphContext): string {
  return `*IMPORTANT*: ${context.playerIntent?.tone}`;
}

/** The tone the player asked for when the chronicle was created. */
function chronicleToneFragment(context: GraphContext): string {
  const { toneChips, toneNotes } = context.chronicleState.chronicle;
  const parts: string[] = [];
  if (toneChips.length > 0) {
    parts.push(`Requested tone: ${toneChips.join(', ')}.`);
  }
  if (toneNotes.trim().length > 0) {
    parts.push(`Tone notes: ${toneNotes.trim()}`);
  }
  return parts.join(' ');
}

function skillCheckFragment(context: GraphContext): Record<string, unknown> {
  return formatSkillCheck(context.skillCheckPlan, context.skillCheckResult);
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
    turnsLeft: Math.max(0, targetEndTurn - context.turnSequence),
  };
}

function seedFragment(context: GraphContext): string | undefined {
  return context.chronicleState.chronicle.seedText;
}
