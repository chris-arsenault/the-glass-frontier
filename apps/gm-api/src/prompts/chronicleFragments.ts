import {
  characterView,
  identityView,
  originAtlasEntityIds,
  originEncyclopediaIds,
  originNamesFrom,
  plainProse,
} from '@glass-frontier/app';
import type { GmNote, PromptTemplateId } from '@glass-frontier/dto';
import { isNonEmptyString } from '@glass-frontier/utils';

import type { GraphContext } from '../types';
import {
  formatIntent,
  formatInventoryItem,
  formatInventoryItemDetail,
  formatSkillCheck,
  recordedPlayerMessage,
} from './contextFormaters';
import { encyclopediaFragment, entityReferencesFragment } from './referenceFragments';

export type ChronicleFragmentTypes =
  | 'character'
  | 'location'
  | 'anchor'
  | 'entities'
  | 'encyclopedia'
  | 'relationships'
  | 'entity-references'
  | 'threads'
  | 'intent'
  | 'skill-check'
  | 'user-message'
  | 'recent-events'
  | 'last-reply'
  | 'chronicle-tone'
  | 'wrap'
  | 'inventory'
  | 'inventory-detail'
  | 'local-continuity'
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

const CHRONICLE_TONE_FRAGMENT: ChronicleFragmentTypes = 'chronicle-tone';
const ENTITY_REFERENCES_FRAGMENT: ChronicleFragmentTypes = 'entity-references';
const INVENTORY_DETAIL_FRAGMENT: ChronicleFragmentTypes = 'inventory-detail';
const LAST_REPLY_FRAGMENT: ChronicleFragmentTypes = 'last-reply';
const LOCAL_CONTINUITY_FRAGMENT: ChronicleFragmentTypes = 'local-continuity';
const RECENT_EVENTS_FRAGMENT: ChronicleFragmentTypes = 'recent-events';
const SKILL_CHECK_FRAGMENT: ChronicleFragmentTypes = 'skill-check';
const USER_MESSAGE_FRAGMENT: ChronicleFragmentTypes = 'user-message';

/**
 * What the writer holds in the original, because passing it through the scout
 * would lose or corrupt it: the scene bound is a number, the item list is a
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
  CHRONICLE_TONE_FRAGMENT, 'threads', 'scene', LOCAL_CONTINUITY_FRAGMENT, LAST_REPLY_FRAGMENT,
  INVENTORY_DETAIL_FRAGMENT, 'seed',
];

export const templateFragmentMapping = new Map<
PromptTemplateId,
ChronicleFragmentTypes[]
>([
  ['action-resolver', [RECENT_EVENTS_FRAGMENT, CHRONICLE_TONE_FRAGMENT, 'threads', 'intent', 'scene', LOCAL_CONTINUITY_FRAGMENT, 'anchor', 'entities', 'encyclopedia', 'relationships', ENTITY_REFERENCES_FRAGMENT, 'character', SKILL_CHECK_FRAGMENT, 'location', INVENTORY_DETAIL_FRAGMENT, 'seed']],
  // The writer templates carry no world dump and no raw chronicle context the
  // scout has already read for them: BRIEF replaces ANCHOR, ENTITIES, CHARACTER,
  // LOCATION, LOCAL-CONTINUITY, RECENT-EVENTS, and INTENT, which is the point of
  // retrieving at all.
  ['agent-action-resolver', [...WRITER_FRAGMENTS, SKILL_CHECK_FRAGMENT]],
  ['agent-clarification-responder', WRITER_FRAGMENTS],
  ['agent-inquiry-describer', WRITER_FRAGMENTS],
  ['agent-planning-narrator', [...WRITER_FRAGMENTS, SKILL_CHECK_FRAGMENT]],
  ['agent-possibility-advisor', WRITER_FRAGMENTS],
  ['agent-reflection-weaver', WRITER_FRAGMENTS],
  ['agent-wrap-resolver', [...WRITER_FRAGMENTS, SKILL_CHECK_FRAGMENT, 'wrap']],
  ['check-planner', [RECENT_EVENTS_FRAGMENT, 'intent', 'scene', LOCAL_CONTINUITY_FRAGMENT, ENTITY_REFERENCES_FRAGMENT, 'character', 'location']],
  ['clarification-responder', [RECENT_EVENTS_FRAGMENT, CHRONICLE_TONE_FRAGMENT, 'threads', 'intent', 'scene', LOCAL_CONTINUITY_FRAGMENT, 'anchor', 'entities', 'encyclopedia', 'relationships', ENTITY_REFERENCES_FRAGMENT, 'character', 'location', INVENTORY_DETAIL_FRAGMENT, 'seed']],
  ['inquiry-describer', [RECENT_EVENTS_FRAGMENT, CHRONICLE_TONE_FRAGMENT, 'threads', 'intent', 'scene', LOCAL_CONTINUITY_FRAGMENT, 'character', 'entities', 'encyclopedia', 'relationships', ENTITY_REFERENCES_FRAGMENT, 'location', INVENTORY_DETAIL_FRAGMENT, 'seed']],
  ['intent-classifier', [RECENT_EVENTS_FRAGMENT, 'scene', 'threads', 'wrap']],
  ['inventory-delta', ['intent', USER_MESSAGE_FRAGMENT, 'inventory']],
  [LOCAL_CONTINUITY_FRAGMENT, ['scene', LOCAL_CONTINUITY_FRAGMENT, 'location']],
  ['location-delta', ['location', LOCAL_CONTINUITY_FRAGMENT]],
  ['planning-narrator', [RECENT_EVENTS_FRAGMENT, CHRONICLE_TONE_FRAGMENT, 'threads', 'intent', 'scene', LOCAL_CONTINUITY_FRAGMENT, 'anchor', 'entities', 'encyclopedia', 'relationships', ENTITY_REFERENCES_FRAGMENT, 'character', SKILL_CHECK_FRAGMENT, 'location', INVENTORY_DETAIL_FRAGMENT, 'seed']],
  ['possibility-advisor', [RECENT_EVENTS_FRAGMENT, CHRONICLE_TONE_FRAGMENT, 'threads', 'intent', 'scene', LOCAL_CONTINUITY_FRAGMENT, 'anchor', 'entities', 'encyclopedia', 'relationships', ENTITY_REFERENCES_FRAGMENT, 'character', 'location', INVENTORY_DETAIL_FRAGMENT, 'seed']],
  ['reflection-weaver', [RECENT_EVENTS_FRAGMENT, CHRONICLE_TONE_FRAGMENT, 'threads', 'intent', 'scene', LOCAL_CONTINUITY_FRAGMENT, 'anchor', 'entities', 'encyclopedia', 'relationships', ENTITY_REFERENCES_FRAGMENT, 'character', 'location', INVENTORY_DETAIL_FRAGMENT, 'seed']],
  ['thread-position', ['threads', 'scene']],
  ['wrap-resolver', [RECENT_EVENTS_FRAGMENT, CHRONICLE_TONE_FRAGMENT, 'threads', 'intent', 'scene', LOCAL_CONTINUITY_FRAGMENT, 'anchor', 'entities', 'encyclopedia', 'relationships', ENTITY_REFERENCES_FRAGMENT, 'character', SKILL_CHECK_FRAGMENT, 'location', INVENTORY_DETAIL_FRAGMENT, 'wrap', 'seed']],
]);

type FragmentHandler = (context: GraphContext) => Promise<unknown> | unknown;

const fragmentHandlers = new Map<ChronicleFragmentTypes, FragmentHandler>([
  ['anchor', anchorFragment],
  ['character', characterFragment],
  [CHRONICLE_TONE_FRAGMENT, chronicleToneFragment],
  ['entities', entitiesFragment],
  ['encyclopedia', encyclopediaFragment],
  ['relationships', relationshipsFragment],
  [ENTITY_REFERENCES_FRAGMENT, entityReferencesFragment],
  ['intent', intentFragment],
  ['inventory', inventoryFragment],
  [INVENTORY_DETAIL_FRAGMENT, inventoryDetailFragment],
  [LOCAL_CONTINUITY_FRAGMENT, localContinuityFragment],
  [LAST_REPLY_FRAGMENT, lastReplyFragment],
  ['location', locationFragment],
  [RECENT_EVENTS_FRAGMENT, recentEventsFragment],
  ['scene', sceneFragment],
  ['seed', seedFragment],
  [SKILL_CHECK_FRAGMENT, skillCheckFragment],
  ['threads', threadsFragment],
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
  const [entities, encyclopediaEntries] = await Promise.all([
    context.worldSchemaStore.listEntitiesByIds(originAtlasEntityIds(character)),
    Promise.all(
      originEncyclopediaIds(character).map((id) => context.encyclopediaStore.getEntryById(id))
    ),
  ]);
  const names = new Map([
    ...entities.map((entity) => [entity.id, entity.name] as const),
    ...encyclopediaEntries
      .filter((entry) => entry !== null)
      .map((entry) => [entry.id, entry.title] as const),
  ]);
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
 * accounts. The retrieval path gets these edges when it opens an Atlas entry;
 * here every live edge among the offered set arrives at once, because the set
 * is already chosen and the query is one round trip.
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

function intentFragment(context: GraphContext): Record<string, unknown> {
  return formatIntent(context.playerIntent);
}

function sceneFragment(context: GraphContext): unknown {
  const scene = context.effectiveScene;
  if (scene === null || scene === undefined) {
    return null;
  }
  return {
    mustAnswerThisTurn: context.sceneWillClose,
    question: scene.question,
    turnsRemaining: scene.turnsRemaining,
    type: scene.type,
  };
}

function threadsFragment(context: GraphContext): unknown {
  const playerThreads = context.effectiveThreads.filter(
    (thread) => thread.perspective === 'player'
  );
  const focused = playerThreads.find(
    (thread) => thread.id === context.effectiveFocusedThreadId
  );
  return {
    focused: focused === undefined
      ? null
      : { goal: focused.goal, position: focused.position, title: focused.title },
    others: playerThreads
      .filter((thread) => thread.id !== context.effectiveFocusedThreadId)
      .map(({ goal, position, title }) => ({ goal, position, title })),
  };
}

function localContinuityFragment(context: GraphContext): string | undefined {
  const continuity = context.chronicleState.chronicle.localContinuity;
  return continuity?.locationName === context.chronicleState.locationName
    ? continuity.note
    : undefined;
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
 * narration showed it: a world thread that stirred quietly on turn three is still
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
