import type { IntentType, PromptTemplateId } from '@glass-frontier/dto';

/** The agent-path replacement for ENTITY_USAGE_POLICY. Appended to every agent template. */
export const RETRIEVAL_POLICY = `## Retrieval policy

Every response is either retrieval tool calls or submit_turn — never plain text.
The WORLD-INDEX lists what exists — entities with their identity field names,
relationships, and lore counts — but no content. Open only what this turn needs;
retrieved material stays in your context for the rest of the turn, so precision
beats volume. Route each need to one tool:

| Need | Tool |
|---|---|
| open chosen identity fields of an entity | read_identity(slug, keys) |
| open one relationship's fields | read_relationship(slug, targetSlug) |
| see a neighbor's index entry without its content | expand(slug) |
| find an entity that is not in the index | search(query) |
| find lore by topic (add the entity name to scope) | search_lore(query) |
| read found lore in full | read_lore(ids) |
| recall an event beyond RECENT-EVENTS | search_history(query) |
| read the turns around a found event | read_turns(fromSequence) |
| finish the turn | submit_turn |

Rounds are scarce; calls are not. Select everything the turn needs from the
index, then open it all in ONE round by making the tool calls together. These
are the only tools; do not look for others. Each result carries the slugs, ids,
or sequence numbers its follow-up takes. Entities marked unwritten are veiled
shells: narrate them as hooks, never invent canon detail for them. Do not
re-request material already provided.

Finish by calling submit_turn with the narration and the entity sidecar. List every
canon entity your narration used, with usage "central" when it drives the turn and
"mentioned" otherwise, plus any emergent tags worth keeping. Only entities whose
material you received — in the seed or through tools — may appear in the sidecar.`;

/** Per-intent sufficiency checks, in the canon's identity-field vocabulary. */
const SUFFICIENCY_CHECKLISTS = new Map<IntentType, string>([
  ['action', 'Before submitting: for a checked action, have you read the location\'s '
    + 'hazards/risks and any opposing entity\'s methods/threat? On failure tiers, '
    + 'ground the complication in retrieved material.'],
  ['clarification', 'Retrieve only if the disputed fact lives in canon; otherwise answer '
    + 'from the scene record.'],
  ['inquiry', 'Before submitting: have you opened the asked-about entity\'s identity and '
    + 'searched its lore for the question\'s terms?'],
  ['planning', 'Before submitting: have you read the identity (access, hazards) of places '
    + 'the preparation or route crosses?'],
  ['possibility', 'Before submitting: are both options grounded in retrieved identity or '
    + 'relationship material (methods, access, terms), not invention?'],
  ['reflection', 'Retrieve only when the reflection turns on an established fact or past '
    + 'event; otherwise work from what the player supplied.'],
  ['wrap', 'Before submitting: have you checked the relationships (terms, cost, standing) '
    + 'of the entities whose threads you are closing?'],
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

export const sufficiencyChecklist = (intentType: IntentType): string => {
  const checklist = SUFFICIENCY_CHECKLISTS.get(intentType);
  if (checklist === undefined) {
    throw new Error(`No sufficiency checklist for intent type ${intentType}.`);
  }
  return checklist;
};

export const agentTemplateFor = (intentType: IntentType): PromptTemplateId => {
  const templateId = AGENT_TEMPLATES.get(intentType);
  if (templateId === undefined) {
    throw new Error(`No agent template for intent type ${intentType}.`);
  }
  return templateId;
};

/** Bake-off register variant: tested against the default voice during shadow. */
export const PLAIN_REGISTER_POLICY = `## Register

Write in a plain, concrete register: short declarative sentences, physical detail
over atmosphere, no ornamental metaphor, no lyrical flourishes. Name things by
their canon names.`;

/** Checklist framing: past-event references route to search_history for every intent. */
export const HISTORY_POLICY =
  'When the player alludes to something outside RECENT-EVENTS, search_history for it '
  + 'before narrating around it.';
