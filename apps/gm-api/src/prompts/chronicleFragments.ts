import type { GmNote, PromptTemplateId } from '@glass-frontier/dto';
import { isNonEmptyString } from '@glass-frontier/utils';

import { advanceSceneClock, isSceneClockFull } from '../scenes/sceneLifecycle';
import type { GraphContext } from '../types';
import {
  formatCharacter,
  formatIntent,
  formatInventoryItem,
  formatInventoryItemDetail,
  formatSkillCheck,
  recordedPlayerMessage,
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
  | 'ledger'
  | 'scene'
  | 'seed';

const RECENT_TURN_WINDOW = 10;
const VERBATIM_TURNS = 5;

const MAX_ANCHOR_LORE = 3;
const MAX_ENTITY_GM_NOTES = 2;
const MAX_ENTITY_LORE = 2;

const MARKDOWN_LINK = /\[([^\]]+)\]\([^)]*\)/gu;

/**
 * Canon prose is authored for the Atlas, so it carries markdown links back
 * into the app — `[Daro Venn](/glass-frontier/entry/daro-venn)` was reaching
 * the narrator verbatim. The model wants the name, not the route.
 */
const plainProse = (text: string | undefined): string | undefined =>
  text === undefined ? undefined : text.replaceAll(MARKDOWN_LINK, '$1');

const LEDGER_FRAGMENT: ChronicleFragmentTypes = 'ledger';

const CHRONICLE_TONE_FRAGMENT: ChronicleFragmentTypes = 'chronicle-tone';
const ENTITY_REFERENCES_FRAGMENT: ChronicleFragmentTypes = 'entity-references';
const INVENTORY_DETAIL_FRAGMENT: ChronicleFragmentTypes = 'inventory-detail';
const RECENT_EVENTS_FRAGMENT: ChronicleFragmentTypes = 'recent-events';
const SKILL_CHECK_FRAGMENT: ChronicleFragmentTypes = 'skill-check';
const USER_MESSAGE_FRAGMENT: ChronicleFragmentTypes = 'user-message';

// prettier-ignore
const WRITER_FRAGMENTS: ChronicleFragmentTypes[] = [
  RECENT_EVENTS_FRAGMENT, 'tone', CHRONICLE_TONE_FRAGMENT, 'intent', 'scene',
  LEDGER_FRAGMENT, ENTITY_REFERENCES_FRAGMENT, 'character', 'location',
  INVENTORY_DETAIL_FRAGMENT, 'seed',
];

export const templateFragmentMapping = new Map<
PromptTemplateId,
ChronicleFragmentTypes[]
>([
  ['action-resolver', [RECENT_EVENTS_FRAGMENT, 'tone', CHRONICLE_TONE_FRAGMENT, 'intent', 'scene', LEDGER_FRAGMENT, 'anchor', 'entities', ENTITY_REFERENCES_FRAGMENT, 'character', SKILL_CHECK_FRAGMENT, 'location', INVENTORY_DETAIL_FRAGMENT, 'seed']],
  // The writer templates carry no world dump: the scout's BRIEF replaces
  // ANCHOR and ENTITIES, which is the point of retrieving at all.
  ['agent-action-resolver', [...WRITER_FRAGMENTS, SKILL_CHECK_FRAGMENT]],
  ['agent-clarification-responder', WRITER_FRAGMENTS],
  ['agent-inquiry-describer', WRITER_FRAGMENTS],
  ['agent-planning-narrator', [...WRITER_FRAGMENTS, SKILL_CHECK_FRAGMENT]],
  ['agent-possibility-advisor', WRITER_FRAGMENTS],
  ['agent-reflection-weaver', WRITER_FRAGMENTS],
  ['agent-wrap-resolver', [...WRITER_FRAGMENTS, SKILL_CHECK_FRAGMENT, 'wrap']],
  ['check-planner', [RECENT_EVENTS_FRAGMENT, 'intent', 'scene', LEDGER_FRAGMENT, ENTITY_REFERENCES_FRAGMENT, 'character', 'location']],
  ['clarification-responder', [RECENT_EVENTS_FRAGMENT, 'tone', CHRONICLE_TONE_FRAGMENT, 'intent', 'scene', LEDGER_FRAGMENT, 'anchor', 'entities', ENTITY_REFERENCES_FRAGMENT, 'character', 'location', INVENTORY_DETAIL_FRAGMENT, 'seed']],
  ['entity-judge', ['entities', ENTITY_REFERENCES_FRAGMENT]],
  ['inquiry-describer', [RECENT_EVENTS_FRAGMENT, 'tone', CHRONICLE_TONE_FRAGMENT, 'intent', 'scene', LEDGER_FRAGMENT, 'character', 'entities', ENTITY_REFERENCES_FRAGMENT, 'location', INVENTORY_DETAIL_FRAGMENT, 'seed']],
  ['intent-classifier', [RECENT_EVENTS_FRAGMENT, 'scene', 'character', 'beats', 'wrap']],
  ['inventory-delta', ['intent', USER_MESSAGE_FRAGMENT, 'inventory']],
  ['planning-narrator', [RECENT_EVENTS_FRAGMENT, 'tone', CHRONICLE_TONE_FRAGMENT, 'intent', 'scene', LEDGER_FRAGMENT, 'anchor', 'entities', ENTITY_REFERENCES_FRAGMENT, 'character', SKILL_CHECK_FRAGMENT, 'location', INVENTORY_DETAIL_FRAGMENT, 'seed']],
  ['possibility-advisor', [RECENT_EVENTS_FRAGMENT, 'tone', CHRONICLE_TONE_FRAGMENT, 'intent', 'scene', LEDGER_FRAGMENT, 'anchor', 'entities', ENTITY_REFERENCES_FRAGMENT, 'character', 'location', INVENTORY_DETAIL_FRAGMENT, 'seed']],
  ['reflection-weaver', [RECENT_EVENTS_FRAGMENT, 'tone', CHRONICLE_TONE_FRAGMENT, 'intent', 'scene', LEDGER_FRAGMENT, 'anchor', 'entities', ENTITY_REFERENCES_FRAGMENT, 'character', 'location', INVENTORY_DETAIL_FRAGMENT, 'seed']],
  ['turn-judge', [RECENT_EVENTS_FRAGMENT, 'intent', 'scene', LEDGER_FRAGMENT, 'beats', 'character', SKILL_CHECK_FRAGMENT, 'location', ENTITY_REFERENCES_FRAGMENT, 'wrap']],
  ['wrap-resolver', [RECENT_EVENTS_FRAGMENT, 'tone', CHRONICLE_TONE_FRAGMENT, 'intent', 'scene', LEDGER_FRAGMENT, 'anchor', 'entities', ENTITY_REFERENCES_FRAGMENT, 'character', SKILL_CHECK_FRAGMENT, 'location', INVENTORY_DETAIL_FRAGMENT, 'wrap', 'seed']],
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
  [LEDGER_FRAGMENT, ledgerFragment],
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
      description: plainProse(entity.description),
      kind: entity.kind,
      name: entity.name,
      recentLore: fragments.slice(0, MAX_ANCHOR_LORE).map((fragment) => ({
        prose: plainProse(fragment.prose),
        title: fragment.title,
      })),
      slug: entity.slug,
      status: entity.status ?? null,
      subkind: entity.subkind ?? null,
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
  loreFragments: Array<{
    title: string;
    summary: string | undefined;
  }>;
  gmNotes: Array<{ kind: GmNote['kind']; text: string | undefined }>;
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
        hook: plainProse(entry.description),
        kind: entry.kind,
        name: entry.name,
        slug: entry.slug,
        unwritten: true as const,
      }
      : {
        description: plainProse(entry.description),
        facts: entry.facts,
        gmNotes: entry.gmNotes.slice(0, MAX_ENTITY_GM_NOTES).map((note) => ({
          kind: note.kind,
          text: plainProse(note.text),
        })),
        kind: entry.kind,
        loreFragments: entry.loreFragments.slice(0, MAX_ENTITY_LORE).map((fragment) => ({
          summary: plainProse(fragment.summary),
          title: fragment.title,
        })),
        name: entry.name,
        slug: entry.slug,
        status: entry.status,
      }
  );
}

function entityReferencesFragment(context: GraphContext): Array<Record<string, unknown>> {
  return (context.entityReferences ?? []).map((reference) => ({
    entitySlug: reference.entitySlug,
    method: reference.method,
    speaker: reference.speaker,
    text: reference.span?.text ?? null,
  }));
}

/**
 * Where the scene is. The bare name was all the GM used to get, which let a
 * hostel grow a fish market: when the name matches canon, the place's kind,
 * description, and status come along so the narration stays the right sort of
 * place.
 */
async function locationFragment(context: GraphContext): Promise<Record<string, unknown>> {
  const name = context.chronicleState.locationName;
  const canon = await context.worldSchemaStore.findLocationByName({ name });
  if (canon === null) {
    return { name };
  }
  return {
    description: canon.description ?? null,
    kind: canon.subkind ?? canon.kind,
    name,
    status: canon.status ?? null,
  };
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

/**
 * The active scene as the judges and narrators should see it: subject, where
 * it is set versus where the chronicle is now, and its clock projected through
 * this turn's check, so the completion judgment reads the same number the
 * player does.
 */
function sceneFragment(context: GraphContext): unknown {
  const scene = context.effectiveScene;
  if (scene === null || scene === undefined) {
    return null;
  }
  const projected = advanceSceneClock(scene, context.skillCheckResult?.outcomeTier);
  return {
    changedLastTurn: scene.changed,
    clockFull: isSceneClockFull(projected),
    currentLocation: context.chronicleState.locationName,
    endsWhen: scene.endsWhen,
    progress: projected.progress,
    progressTarget: projected.progressTarget,
    quietTurns: scene.quietTurns,
    stakes: scene.stakes,
    startedAtLocation: scene.location ?? null,
    startedAtTurn: scene.startedAtTurn,
    subject: scene.subject,
    subjectKind: scene.subjectKind,
    type: scene.type,
  };
}

function ledgerFragment(context: GraphContext): unknown {
  return context.chronicleState.chronicle.sceneLedger;
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

/**
 * The turn record, most recent last.
 *
 * The player's line is what the player actually typed, always and in full.
 * It used to be `playerIntent.intentSummary` — the classifier's paraphrase —
 * so "i don't really have time to deal with this insignificant scum" reached
 * the narrator as "Zale pulls out her stun piston and shoots the scum", and
 * the wish to be done with the man vanished from the record entirely.
 *
 * The recent turns carry the narration itself; older ones fall back to their
 * summary, which is what a summary is for.
 */
function recentEventsFragment(context: GraphContext): string {
  const turns = context.chronicleState.turns.slice(-RECENT_TURN_WINDOW);
  const verbatimFrom = turns.length - VERBATIM_TURNS;
  return turns
    .map((turn, index) => {
      const gm = index >= verbatimFrom
        ? turn.gmResponse?.content ?? turn.gmSummary
        : turn.gmSummary;
      const check =
        turn.skillCheckResult === undefined || turn.skillCheckPlan === undefined
          ? ''
          : `\nC: ${turn.skillCheckPlan.skill} at ${turn.skillCheckPlan.riskLevel} risk`
            + ` → ${turn.skillCheckResult.outcomeTier}`;
      return `Turn ${turn.turnSequence + 1}`
        + `\nP: ${recordedPlayerMessage(
          turn.playerMessage.content, turn.playerIntent?.intentSummary
        )}`
        + `\nG: ${gm ?? '(the turn produced no narration)'}${check}`;
    })
    .join('\n\n');
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
