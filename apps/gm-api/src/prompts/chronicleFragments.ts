import {
  characterView,
  identityView,
  originEntityIds,
  originNamesFrom,
  plainProse,
} from '@glass-frontier/app';
import type { GmNote, PromptTemplateId } from '@glass-frontier/dto';
import { isNonEmptyString } from '@glass-frontier/utils';

import { advanceSceneClock, isSceneClockFull } from '../scenes/sceneLifecycle';
import type { GraphContext } from '../types';
import { visibleFronts } from '../world/fronts';
import {
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
  | 'relationships'
  | 'entity-references'
  | 'beats'
  | 'intent'
  | 'skill-check'
  | 'user-message'
  | 'recent-events'
  | 'last-reply'
  | 'tone'
  | 'chronicle-tone'
  | 'wrap'
  | 'inventory'
  | 'inventory-detail'
  | 'fronts'
  | 'ledger'
  | 'scene'
  | 'seed';

const RECENT_TURN_WINDOW = 10;
const VERBATIM_TURNS = 5;

const MAX_ANCHOR_LORE = 3;
/**
 * ENTITIES reaches only the writers that hold no brief, so these caps size the
 * one-shot's whole view of the world. It has one call and no way to ask for
 * more, and two notes and two lore summaries was a thinner read of an entity
 * than the retrieval path takes in a single `open`.
 */
const MAX_ENTITY_GM_NOTES = 4;
const MAX_ENTITY_LORE = 4;

const LEDGER_FRAGMENT: ChronicleFragmentTypes = 'ledger';

const CHRONICLE_TONE_FRAGMENT: ChronicleFragmentTypes = 'chronicle-tone';
const ENTITY_REFERENCES_FRAGMENT: ChronicleFragmentTypes = 'entity-references';
const INVENTORY_DETAIL_FRAGMENT: ChronicleFragmentTypes = 'inventory-detail';
const LAST_REPLY_FRAGMENT: ChronicleFragmentTypes = 'last-reply';
const RECENT_EVENTS_FRAGMENT: ChronicleFragmentTypes = 'recent-events';
const SKILL_CHECK_FRAGMENT: ChronicleFragmentTypes = 'skill-check';
const USER_MESSAGE_FRAGMENT: ChronicleFragmentTypes = 'user-message';

/**
 * What the writer holds in the original, because passing it through the scout
 * would lose or corrupt it: the scene clock is a number, the item list is a
 * manifest, last turn's narration is the voice this turn must not contradict,
 * the seed is the premise, and tone is an instruction rather than information.
 * Everything the writer needs judgement about — who this person is, where they
 * are, who is with them, what has happened — arrives as the brief, written by
 * the only stage that has read both the chronicle and the world.
 *
 * SKILL-CHECK joins this list per template, and the player's own message
 * arrives through `messageOrder`.
 */
// prettier-ignore
const WRITER_FRAGMENTS: ChronicleFragmentTypes[] = [
  'tone', CHRONICLE_TONE_FRAGMENT, 'scene', LAST_REPLY_FRAGMENT,
  INVENTORY_DETAIL_FRAGMENT, 'seed',
];

export const templateFragmentMapping = new Map<
PromptTemplateId,
ChronicleFragmentTypes[]
>([
  ['action-resolver', [RECENT_EVENTS_FRAGMENT, 'tone', CHRONICLE_TONE_FRAGMENT, 'intent', 'scene', LEDGER_FRAGMENT, 'anchor', 'entities', 'relationships', ENTITY_REFERENCES_FRAGMENT, 'character', SKILL_CHECK_FRAGMENT, 'location', INVENTORY_DETAIL_FRAGMENT, 'seed']],
  // The writer templates carry no world dump and no raw chronicle context the
  // scout has already read for them: BRIEF replaces ANCHOR, ENTITIES, CHARACTER,
  // LOCATION, LEDGER, RECENT-EVENTS, and INTENT, which is the point of
  // retrieving at all.
  ['agent-action-resolver', [...WRITER_FRAGMENTS, SKILL_CHECK_FRAGMENT]],
  ['agent-clarification-responder', WRITER_FRAGMENTS],
  ['agent-inquiry-describer', WRITER_FRAGMENTS],
  ['agent-planning-narrator', [...WRITER_FRAGMENTS, SKILL_CHECK_FRAGMENT]],
  ['agent-possibility-advisor', WRITER_FRAGMENTS],
  ['agent-reflection-weaver', WRITER_FRAGMENTS],
  ['agent-wrap-resolver', [...WRITER_FRAGMENTS, SKILL_CHECK_FRAGMENT, 'wrap']],
  ['check-planner', [RECENT_EVENTS_FRAGMENT, 'intent', 'scene', LEDGER_FRAGMENT, ENTITY_REFERENCES_FRAGMENT, 'character', 'location']],
  ['clarification-responder', [RECENT_EVENTS_FRAGMENT, 'tone', CHRONICLE_TONE_FRAGMENT, 'intent', 'scene', LEDGER_FRAGMENT, 'anchor', 'entities', 'relationships', ENTITY_REFERENCES_FRAGMENT, 'character', 'location', INVENTORY_DETAIL_FRAGMENT, 'seed']],
  ['inquiry-describer', [RECENT_EVENTS_FRAGMENT, 'tone', CHRONICLE_TONE_FRAGMENT, 'intent', 'scene', LEDGER_FRAGMENT, 'character', 'entities', 'relationships', ENTITY_REFERENCES_FRAGMENT, 'location', INVENTORY_DETAIL_FRAGMENT, 'seed']],
  ['intent-classifier', [RECENT_EVENTS_FRAGMENT, 'scene', 'character', 'beats', 'wrap']],
  ['inventory-delta', ['intent', USER_MESSAGE_FRAGMENT, 'inventory']],
  ['planning-narrator', [RECENT_EVENTS_FRAGMENT, 'tone', CHRONICLE_TONE_FRAGMENT, 'intent', 'scene', LEDGER_FRAGMENT, 'anchor', 'entities', 'relationships', ENTITY_REFERENCES_FRAGMENT, 'character', SKILL_CHECK_FRAGMENT, 'location', INVENTORY_DETAIL_FRAGMENT, 'seed']],
  ['possibility-advisor', [RECENT_EVENTS_FRAGMENT, 'tone', CHRONICLE_TONE_FRAGMENT, 'intent', 'scene', LEDGER_FRAGMENT, 'anchor', 'entities', 'relationships', ENTITY_REFERENCES_FRAGMENT, 'character', 'location', INVENTORY_DETAIL_FRAGMENT, 'seed']],
  ['reflection-weaver', [RECENT_EVENTS_FRAGMENT, 'tone', CHRONICLE_TONE_FRAGMENT, 'intent', 'scene', LEDGER_FRAGMENT, 'anchor', 'entities', 'relationships', ENTITY_REFERENCES_FRAGMENT, 'character', 'location', INVENTORY_DETAIL_FRAGMENT, 'seed']],
  ['turn-judge', [RECENT_EVENTS_FRAGMENT, 'intent', 'scene', LEDGER_FRAGMENT, 'beats', 'character', SKILL_CHECK_FRAGMENT, 'location', ENTITY_REFERENCES_FRAGMENT, 'wrap']],
  ['wrap-resolver', [RECENT_EVENTS_FRAGMENT, 'tone', CHRONICLE_TONE_FRAGMENT, 'intent', 'scene', LEDGER_FRAGMENT, 'anchor', 'entities', 'relationships', ENTITY_REFERENCES_FRAGMENT, 'character', SKILL_CHECK_FRAGMENT, 'location', INVENTORY_DETAIL_FRAGMENT, 'wrap', 'seed']],
]);

type FragmentHandler = (context: GraphContext) => Promise<unknown> | unknown;

const fragmentHandlers = new Map<ChronicleFragmentTypes, FragmentHandler>([
  ['anchor', anchorFragment],
  ['beats', beatsFragment],
  ['character', characterFragment],
  [CHRONICLE_TONE_FRAGMENT, chronicleToneFragment],
  ['entities', entitiesFragment],
  ['relationships', relationshipsFragment],
  [ENTITY_REFERENCES_FRAGMENT, entityReferencesFragment],
  ['intent', intentFragment],
  ['inventory', inventoryFragment],
  [INVENTORY_DETAIL_FRAGMENT, inventoryDetailFragment],
  ['fronts', frontsFragment],
  [LEDGER_FRAGMENT, ledgerFragment],
  [LAST_REPLY_FRAGMENT, lastReplyFragment],
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
  const entities = await context.worldSchemaStore.listEntitiesByIds(originEntityIds(character));
  const names = new Map(entities.map((entity) => [entity.id, entity.name]));
  return characterView(character, originNamesFrom(character, names));
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
  descriptiveIdentity: Record<string, string | undefined> | undefined;
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

/**
 * How the entities in ENTITIES stand with each other, as canon records it.
 *
 * A list of entities is a cast with no ties between them, and the writer that
 * holds no brief has nowhere else to learn that one of them keeps the other's
 * accounts. The retrieval path asks for this an edge at a time with
 * `read_relationship`; here every live edge among the offered set arrives at
 * once, because the set is already chosen and the query is one round trip.
 */
function relationshipsFragment(context: GraphContext): unknown[] {
  const bySlug = new Map(
    (context.entityContext?.offered ?? []).map((entry) => [entry.id, entry.slug])
  );
  return (context.entityRelationships ?? []).flatMap((edge) => {
    const source = bySlug.get(edge.srcId);
    const target = bySlug.get(edge.dstId);
    if (source === undefined || target === undefined) {
      return [];
    }
    return [{
      from: source,
      identity: identityView(edge.descriptiveIdentity),
      to: target,
      verb: edge.relationship,
    }];
  });
}

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
        descriptiveIdentity: identityView(entry.descriptiveIdentity),
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

/**
 * What the world is working toward, as retrieval hints — never as a boundary
 * on what may be looked up. Spent and abandoned agendas are left out; a front
 * that has already landed stays visible for the turn it lands on.
 */
function frontsFragment(context: GraphContext): unknown {
  return visibleFronts(context.chronicleState.chronicle.fronts).map((front) => ({
    agent: front.agentSlug,
    clock: `${front.filled}/${front.size}`,
    id: front.id,
    intent: front.intent,
    nextSign: front.nextSign,
    ...front.status === 'fired' ? { landing: true } : {},
  }));
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
 * The world's line is what the world was doing that turn, whether or not the
 * narration showed it: a front that stirred quietly on turn three is still
 * here to be found when it lands on turn nine.
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
      const world = turn.worldContent === undefined ? '' : `\nW: ${turn.worldContent}`;
      return `Turn ${turn.turnSequence + 1}`
        + `\nP: ${recordedPlayerMessage(
          turn.playerMessage.content, turn.playerIntent?.intentSummary
        )}`
        + world
        + `\nG: ${gm ?? '(the turn produced no narration)'}${check}`;
    })
    .join('\n\n');
}

/**
 * Last turn's narration, exactly as it was written. The writer is continuing
 * its own prose and must not contradict a detail it put on the page one turn
 * ago; everything further back reaches it through the brief's history, read
 * against what this turn is actually about.
 */
function lastReplyFragment(context: GraphContext): string {
  const previous = context.chronicleState.turns.at(-1);
  return previous?.gmResponse?.content ?? previous?.gmSummary ?? '';
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
