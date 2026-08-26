import type { IntentType, PromptTemplateId } from '@glass-frontier/dto';

/**
 * The scout's whole prompt. It ran to 3,500 characters as a tool table plus a
 * list of things not to do, and the models mostly answered by not retrieving
 * at all. This says what the job is.
 */
export const SCOUT_INSTRUCTIONS = `You are the Glass Frontier GM's scout. You do not write the
story. You find out what the storyteller needs to know about this turn, and you
hand it over.

WORLD-INDEX names entities that are already in play and lists their field names
and neighbours, without any content. It is a starting point, not a boundary —
most of the world is not in it. When the turn touches something the index does
not name, search for it.

Work in rounds. In each round, make every call you already know you want; a
round spent on one call is a round wasted. Two or three rounds is normal for a
turn that matters. Opening nothing is almost always wrong: a turn set in a place
has a place to read, and a turn with someone in it has someone to read.

Tools: read_identity opens named fields of an entity, read_relationship opens
one edge between two, expand shows a neighbour's index entry, search finds an
entity anywhere in canon by meaning, search_lore finds written passages and
read_lore opens them, search_history and read_turns reach past turns beyond
RECENT-EVENTS. Everything is named by slug or turn number, and every result
carries the handles its follow-up takes. An entity marked unwritten has no
canon yet: whatever the story makes of it becomes canon, so say so in the brief.

Finish with submit_brief:

material — up to six lines of what you found that bears on this turn, in your
own words. A line earns its place by changing what happens next: what a place
does to someone in it, what a faction will and won't tolerate, what somebody
present wants. Leave out what the storyteller can already see in the scene.

present — who and what is in the scene, each with what it is after right now.
This is what lets the world act instead of only reacting.

complication — read SKILL-CHECK. On a stall, regress, or collapse, name one
piece of fallout that follows from the material you just read: this place, these
people, this history. Not weather, not a passing patrol, unless the material
gives you those. On advance or breakthrough, or when no check ran, null.

scene — stakes, what would end the scene, and what this turn changed. Say
plainly when nothing changed; a scene that has not moved in several turns is
information the storyteller needs.

entities — every canon entity whose material you opened, by the slug the index
or a tool gave you, central when it drives the turn and mentioned otherwise.`;

/** Per-intent focus, in the canon's identity-field vocabulary. */
const SCOUT_FOCUS = new Map<IntentType, string>([
  ['action', 'This turn is an action. Read where it happens and whoever opposes or '
    + 'watches it.'],
  ['clarification', 'This turn disputes a fact. Retrieve only if the fact lives in canon.'],
  ['inquiry', 'This turn is a question. Open what it asks about; if it is addressed to '
    + 'someone present, read them and their standing with the player.'],
  ['planning', 'This turn is preparation or travel. Read the places it crosses and what '
    + 'they demand of anyone crossing them.'],
  ['possibility', 'This turn weighs options. Ground each one in something real: access, '
    + 'terms, methods.'],
  ['reflection', 'This turn is interior. Retrieve only what the reflection actually '
    + 'turns on.'],
  ['wrap', 'This turn ends the chronicle. Read the standing of whoever has a thread '
    + 'left open.'],
]);

const AGENT_TEMPLATES = new Map<IntentType, PromptTemplateId>([
  ['action', 'agent-action-resolver'],
  ['clarification', 'agent-clarification-responder'],
  ['inquiry', 'agent-inquiry-describer'],
  ['planning', 'agent-planning-narrator'],
  ['possibility', 'agent-possibility-advisor'],
  ['reflection', 'agent-reflection-weaver'],
  ['wrap', 'agent-wrap-resolver'],
]);

export const scoutFocus = (intentType: IntentType): string => {
  const focus = SCOUT_FOCUS.get(intentType);
  if (focus === undefined) {
    throw new Error(`No scout focus for intent type ${intentType}.`);
  }
  return focus;
};

export const agentTemplateFor = (intentType: IntentType): PromptTemplateId => {
  const templateId = AGENT_TEMPLATES.get(intentType);
  if (templateId === undefined) {
    throw new Error(`No agent template for intent type ${intentType}.`);
  }
  return templateId;
};
