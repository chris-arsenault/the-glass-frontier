# IMP-GM-07 – Flat Curated Scene Types

**Date:** 2026-08-22
**Status:** Plan
**Touchpoints:** DTOs, GM intent pipeline, prompt templates, chronicle
persistence, turn persistence, client state, transcript UI, E2E fixtures.

## Purpose

Add durable, strongly curated scene types to the existing free-text narrative
loop. A player continues to type anything without commands, keywords, buttons,
or required mechanical selections. The intent classifier detects when the
fiction has entered or changed a typed scene, and the rest of the existing
intent pipeline resolves the turn under that scene's rules.

Initial scene types:

- `dialog`
- `battle`
- `hunt`
- `chase`
- `search`

No active typed scene means ordinary Glass Frontier freeform play. There is no
`freeform` scene type.

## Fixed decisions

1. **Flat lifecycle.** A chronicle has at most one active typed scene. Starting
   another typed scene replaces the current one; no stack, nesting, pause, or
   return behavior ships initially.
2. **Heavy bias.** The active scene strongly controls check frequency, prompt
   behavior, response voice, pacing, completion rules, and client presentation.
   It does not merely add a tag.
3. **Intent remains the per-turn router.** Scene type is durable context for
   intent classification and resolution, not a replacement graph or parallel
   narrative engine.
4. **Free text remains the only required interaction.** No scene commands,
   keyword triggers, scene-type picker, skill picker, or confirmation turn.
5. **General subject contract.** Every typed scene records `subject` and
   `subjectKind`; no dialog-only `partner` field.
6. **Canonical subject text.** `subject` is the name used by the scene and UI.
   The system does not search alternate fields or repeatedly rename the subject
   while a scene stays active.
7. **No feature flag.** Once complete, this is the canonical turn behavior.

## Why this extends intents

Intent answers, "What is the player doing in this message?"

Scene type answers, "What kind of situation governs this and subsequent
messages?"

They compose:

```text
dialog + inquiry       -> the NPC answers or refuses
dialog + action        -> persuasion, threat, lie, departure, interruption
battle + action        -> contested physical move
battle + inquiry       -> immediate tactical observation
search + action        -> active inspection that consumes time or creates risk
search + inquiry       -> description of what is already plainly visible
```

The existing node order remains:

```text
intent classifier
  -> beat detector + check planner
  -> entity selector
  -> check runner
  -> GM response
  -> entity/beat/summary/inventory/location post-processing
```

The intent result gains a scene directive. The effective scene is available to
every downstream node on the same turn.

## Domain model

Add `packages/dto/src/narrative/Scene.ts`.

### Scene type

```ts
export const SceneType = z.enum([
  'dialog',
  'battle',
  'hunt',
  'chase',
  'search',
]);
```

### Subject kind

Do not invent a scene-specific kind enum. The world already has one:
`HardStateKind` in `packages/dto/src/world/vocabulary.ts`, derived from
tsonu-canon (`npc`, `creature`, `faction`, `geographic_location`,
`installation`, `transport`, `artifact`, `resource`, and so on). Reuse it:

```ts
subjectKind: HardStateKind;
```

Place-ness is not a kind. An entity's game-layer "a scene can be set here"
concept is the `isLocation` flag on `HardState`, defaulted from the kind and
overridable per entity. A `search` subject is therefore a normal kind such as
`installation`, `geographic_location`, `transport`, or `artifact` that happens to
be `isLocation`, not a bespoke `location` kind.

`subjectKind` labels what the scene is about so the UI and prompts can render
it. The classifier picks the best-fit kind from the existing taxonomy. Do not
enforce a per-type allow matrix that fails a turn on an unusual pairing; that
turns a classifier quirk into a broken turn in a free-text product. The registry
may suggest typical kinds per type in the classifier prompt, not gate them.
Examples: `dialog` -> `Amaya Venn` (`npc`); `battle` -> `Brake Cutters`
(`faction`); `search` -> `the wrecked tender` (`transport`).

### Chronicle scene

```ts
export const ChronicleScene = z.object({
  id: z.string().min(1),
  startedAtTurn: z.number().int().nonnegative(),
  subject: z.string().min(1),
  subjectKind: HardStateKind,
  type: SceneType,
});
```

`subject` and `subjectKind` are required for every typed scene. Do not add
type-specific nullable columns such as `dialogPartner`, `quarry`, or
`searchLocation`. `subject` is a display string (a canon entity name or an
ad-hoc name like "the red courier kite"); it does not have to resolve to a canon
entity. If we later want to link it, add an optional `subjectEntityId`, not a
second subject system.

The scene does not initially store clocks, HP, nested scenes, portraits,
status, start/completion reasons, or type-specific payloads. Add those only when
the corresponding mechanics are implemented.

### Chronicle changes

Extend `Chronicle` with a single nullable active scene:

```ts
activeScene: ChronicleScene.nullable().default(null),
```

Invariants:

- `activeScene` is null exactly when no typed scene is running;
- a new typed scene overwrites `activeScene`;
- completing a scene sets `activeScene` back to null.

Do not persist a separate chronicle-level log of completed scenes. Each turn
stores the minimal scene context that governed it (see below), which is enough
for consistent historical UI, scene grouping, and the Phase 8 play-data review.
Store `activeScene` in the existing chronicle `props` JSON; no scene table.

### Turn-level scene data

Live scene state is `chronicle.activeScene`. Each committed turn also stores a
minimal snapshot of the scene that governed that turn:

```ts
sceneContext: z.object({
  outcome: z.enum(['continue', 'complete']),
  sceneId: z.string().min(1),
  subject: z.string().min(1),
  subjectKind: HardStateKind,
  type: SceneType,
}).nullable().optional(),
```

Freeform turns store null. The final turn of a typed scene stores
`outcome: complete`.

This is not a second scene-state system. It is immutable turn metadata, like the
existing check result or beat tracker, used to:

- keep historical transcript presentation consistent after the active scene
  changes;
- group and inspect turns by scene without replaying classifier transitions;
- preserve the subject and taxonomy kind exactly as the player saw them;
- measure scene duration and completion during the play-data review.

Do not reconstruct this state by scanning transitions. That adds brittle replay
logic to every client or report that needs scene history.

`chronicle_turn` is not stored as one JSONB document. It uses explicit columns,
with selected structured fields (`player_intent`, check plan/result, deltas,
beat tracker, traces) stored as JSONB. Add one `scene_context jsonb` column and
wire it through `ChronicleTurnPersistence`, matching that existing pattern.

## Scene directive on intent

Extend `Intent` with one nullable field:

```ts
sceneChange: z.object({
  subject: z.string().min(1),
  subjectKind: HardStateKind,
  type: SceneType,
}).nullable().default(null);
```

`sceneChange` is null on the vast majority of turns: the player is either in
freeform play or continuing the active scene. A non-null `sceneChange` means the
fiction has entered a typed scene *of this type about this subject*.

The classifier does not choose between "start" and "replace", and does not emit
a "stay" token. The server already knows whether a scene is active, so the
reducer decides:

- `sceneChange` null -> keep the persisted active scene (or stay freeform);
- `sceneChange` set, no active scene -> start it;
- `sceneChange` set, active scene of the same type and subject -> treat as a
  continuation (no change);
- `sceneChange` set, different type or subject -> replace.

A malformed `sceneChange` (missing field, empty subject) degrades to null. Do
not fail the player's turn over a classifier quirk in a free-text product.

There is no pre-narration `end` signal. Leaving a dialog, escaping a battle, or
abandoning a search is an action inside that scene: the scene-aware narrator
resolves it and the post-narration judgment closes the scene.

## Effective scene during a turn

The scene change must affect the same turn that triggers it. After
`IntentClassifierNode` returns, the reducer applies the rules above and places
the result on `GraphContext.effectiveScene` (the active or newly started scene,
or null). Downstream classifiers and the narrator read `effectiveScene`, not the
pre-turn chronicle scene. A newly started scene uses
`id = "scene:" + context.turnId`.

`WorldUpdater` persists `activeScene` after the graph finishes, keeping mutation
in the existing post-graph update boundary. Replacement simply overwrites
`activeScene`; there is no completed-scene log to append to.

## Post-narration completion

Extend `GmSummaryNode` output:

```ts
sceneOutcome: z.enum(['continue', 'complete']),
sceneOutcomeReason: z.string().min(1).nullable(),
```

Rules:

- If `effectiveScene` is null, output `continue` and a null reason.
- `complete` means the current turn belongs to the scene and is its final turn.
- Build the turn's `sceneContext` from `effectiveScene` plus `sceneOutcome`.
- On `complete`, persist that final turn with `outcome: complete`, then clear
  `activeScene`.
- Chronicle closure also completes the active scene on the closing turn.
- A narrator asking the player an ordinary next question does not by itself
  keep a scene open; the scene policy's completion conditions decide.

This reuses the existing GM-summary model call. Do not add a separate scene
judge invocation.

## Scene registry

Create one typed registry in the GM package. It is code-owned policy, not
database configuration.

```ts
type SceneTypeDefinition = {
  suggestedSubjectKinds: readonly HardStateKind[];
  promptTemplateId: ScenePromptTemplateId;
  presentation: ScenePresentation;
};
```

`suggestedSubjectKinds` is classifier-prompt guidance, not a validation gate.

`presentation` is a string naming the client stage for the type. Define only the
tokens for types that are actually built (`speaking-head` for dialog first,
`action-pressure` for battle next); add the rest with their type. Do not add
numeric bias knobs such as `riskSkew` or `checkFrequency`. Heavy bias belongs in
clear scene-specific prompt rules that can be reviewed and tested.

## Prompt composition

Do not create a second narrator graph or a class for every `(intent, scene)`
combination.

Add one scene policy template per type:

- `scene-dialog`
- `scene-battle`
- `scene-hunt`
- `scene-chase`
- `scene-search`

Register them through `PromptTemplateIds`, descriptors, migrations/seed data,
and the existing template manager so administrators retain the normal prompt
review surface.

For a typed scene, `PromptComposer` builds:

```text
existing intent-specific instructions
+ scene-type policy instructions
+ normal developer fragments
```

The intent prompt still determines whether the turn is an action, inquiry,
clarification, possibility, planning, reflection, or wrap. The scene policy
sets the strict local interpretation.

Add a `scene` fragment containing:

```json
{
  "id": "scene:<turn-id>",
  "type": "dialog",
  "subject": "Amaya Venn",
  "subjectKind": "npc",
  "startedAtTurn": 4
}
```

Include it in:

- `intent-classifier`
- `check-planner`
- every intent narrator
- `gm-summary`

Do not inject it into `intent-beat-detector`, `entity-judge`, `inventory-delta`,
or `location-delta`. Those extract deterministic deltas or long-horizon threads
where scene type does not change the answer; adding it there is context cost
without behavior change. Add it to one of them only if play data shows a
concrete misclassification the scene context would fix.

The active subject must remain prominent in retrieval and narration. The
initial version uses the canonical subject string. It does not add name-based
fallback searches or a second subject lookup system.

## Heavy-bias policies

### Dialog

**Subject:** `npc`

**Client:** persistent speaking-head stage with subject name and scene label;
GM transcript entries governed by the scene are labelled with the subject name
rather than generic `GM`.

**Intent bias:**

- direct speech and questions addressed to the subject normally remain within
  dialog;
- do not classify spoken disagreement as reflection merely because it includes
  emotion or motive;
- physical departure, violence, or pursuit may complete or replace the scene.

**Check policy:**

- ordinary exchange and freely offered information require no check;
- require checks for uncertain attempts to alter the NPC's choice, extract
  withheld information, deceive, threaten, compel, or resist social pressure;
- a failed social check changes the NPC's stance, available information, cost,
  or willingness to continue; it does not invent unrelated physical harm.

**Narration policy:**

- the subject speaks and visibly reacts;
- preserve the subject's knowledge limits, goals, and established voice;
- answer through dialogue when the NPC can answer;
- use short observable narration around speech;
- never turn the subject into an omniscient GM mouthpiece.

**Completion:**

- either party leaves or refuses further conversation;
- the immediate conversational purpose resolves or becomes impossible;
- violence or pursuit replaces the scene;
- the subject becomes unavailable.

### Battle

**Typical subject kinds:** `npc`, `creature`, `transport`, or `faction`

**Client:** action-pressure stage naming the opposition. Numeric pressure is a
later phase; the first implementation supplies presentation and prompt rules.

**Intent bias:**

- concrete attempts to change position, harm, protect, escape, seize, or
  disable are actions;
- planning performed under immediate opposition is an action, not a safe
  planning montage;
- inquiries describe the immediate tactical field without freezing opposition.

**Check policy:**

- consequential contested actions normally require checks;
- trivial movement or uncontested interaction does not;
- failed checks must change position, impose cost, narrow choices, or advance
  opposition.

**Narration policy:**

- lead with the immediate result;
- opposition acts and changes the board;
- keep time tight and physical;
- do not add a fresh opponent or phase after the battle's question is answered.

**Completion:**

- opposition is defeated, routed, disabled, surrendered, or no longer fighting;
- the player escapes, surrenders, or can no longer participate;
- another typed scene replaces the battle.

### Hunt

**Typical subject kinds:** `npc`, `creature`, or `transport`

**Client:** quarry stage showing the named target and current hunt scene.

**Check policy:**

- checks apply to uncertain tracking, approach, concealment, prediction, and
  interception where failure costs time, position, exposure, or the trail;
- plainly visible signs and ordinary travel do not require checks.

**Narration policy:**

- every result changes distance, certainty, exposure, route, or quarry
  behavior;
- do not substitute repeated clues for progress.

**Completion:**

- quarry is found, caught, conclusively lost, or abandoned;
- contact replaces the hunt with dialog or battle;
- immediate pursuit replaces it with chase.

### Chase

**Typical subject kinds:** `npc`, `creature`, or `transport`

**Client:** pursuit stage showing the target.

**Intent and check policy:**

- meaningful movement advances time;
- maneuvers that gain/lose distance, change route, obstruct, rescue, or escape
  normally require checks when contested;
- tactical inquiries reveal what can be perceived in motion and do not pause
  the chase.

**Narration policy:**

- every turn changes distance, route, danger, or control;
- no stationary diagnostic loops.

**Completion:**

- target is caught, escapes, is lost, stops, or is abandoned;
- contact replaces the chase with battle or dialog.

### Search

**Typical subject kinds:** `geographic_location`, `installation`, `transport`,
`artifact`, or `resource`; location-shaped subjects also carry `isLocation`.

**Client:** inspection stage naming the searched subject.

**Intent bias:**

- active inspection, testing, opening, dismantling, tracing, or moving through
  the subject is an action;
- asking what is already visible is inquiry;
- do not convert every question into a no-time inquiry when the player is
  clearly searching.

**Check policy:**

- require a check only when discovery is uncertain and failure has a real cost:
  time, exposure, damage, contamination, lost evidence, or a closed route;
- ordinary description and inevitable discovery need no check.

**Narration policy:**

- produce concrete spatial or material findings;
- distinguish "not found here" from "not present anywhere";
- do not add endless nested clues.

**Completion:**

- the sought answer/object/route is found;
- the searched subject is exhausted or conclusively ruled out;
- the player abandons the search;
- a discovery replaces the scene with dialog, battle, hunt, or chase.

## Client design

### Active scene stage

Add a `SceneStage` above `ChatCanvas` and below `ChronicleHeader`.

It reads `chronicleRecord.activeScene`. When it is null, the stage renders
nothing and the current layout is unchanged.

Add presentation components only for built types (`DialogSceneStage` first, then
`BattleSceneStage`), each behind the type's `presentation` token. Add the
remaining stages with their types. The components share a common frame with
type-specific labels; do not build one component that switches on many nullable
props.

### Speaking head

No portrait/media field exists in the current entity contract. The first dialog
stage therefore uses a consistent bust/monogram presentation derived from the
required subject name, not an inferred image lookup. Actual NPC portraits
require a later canonical entity-media contract.

The dialog stage displays:

- subject monogram/bust;
- subject name;
- `Dialog` label;
- optional current-turn activity/progress indicator.

For historical entries, `TurnView.sceneContext` supplies the subject label and
presentation. A dialog response remains attributed to its NPC after the
chronicle moves to another scene.

### Store and transport

Extend:

- client `ChronicleState` with active scene derivation from `chronicleRecord`;
- `TurnView` with `sceneContext`;
- history hydration and progress/final-turn merge paths;
- GM response rendering label from the turn's persisted scene context;
- feedback payload context if scene type is useful to later analysis.

Do not add a scene-start button or typed-scene selector.

## Persistence

### Chronicle

`Chronicle.activeScene` lives in `chronicle.props`. Update `normalizeChronicle`
so old records default `activeScene` to null. Because the schema default handles
the missing field, a data migration is optional; add one only if a runtime path
reads the raw column before normalization. Do not add legacy field aliases or a
completed-scene array.

### Turn

Add `scene_context jsonb` to `chronicle_turn` in the next sequential migration
and matching rollback. Update:

- `TURN_SELECT`
- `TURN_INSERT`
- row type
- `toTurn`
- `turnParameters`
- initial schema/bootstrap SQL

`sceneChange` also persists inside the existing `player_intent` jsonb because it
is a field on `Intent`, but consumers must not replay it to reconstruct
historical scene context. The snapshot is authoritative for that turn.

## Implementation phases

### Phase 1 – Shared contracts and registry

Files:

- `packages/dto/src/narrative/Scene.ts`
- `packages/dto/src/narrative/Chronicle.ts`
- `packages/dto/src/narrative/Intent.ts`
- `packages/dto/src/narrative/Turn.ts`
- `packages/dto/src/index.ts`
- new GM scene registry module

Deliver:

- canonical enums and schemas;
- nullable `activeScene` on the chronicle and `sceneChange` on intent;
- the reducer that maps `sceneChange` to stay/start/continue/replace;
- malformed `sceneChange` degrades to stay;
- unit coverage for the reducer cases.

### Phase 2 – Persistence and hydration

Files:

- next sequential `db/migrations/*.sql` and rollback
- `db/migrations/001_initial.sql`
- `packages/worldstate/src/chronicleStore.ts`
- `packages/worldstate/src/chronicleTurnPersistence.ts`
- worldstate tests/harness

Deliver:

- `activeScene` persisted in chronicle props via the existing props write;
- `normalizeChronicle` defaults missing `activeScene` to null;
- one `scene_context jsonb` column round-trips the minimal per-turn snapshot;
- `sceneChange` continues to round-trip inside the existing `player_intent`
  jsonb;
- idempotent turn commit and history loading remain unchanged.

### Phase 3 – Intent-owned scene lifecycle

Files:

- `apps/gm-api/src/gmGraph/nodes/classifiers/IntentClassifierNode.ts`
- `packages/app/templates/intent-classifier.hbs`
- `apps/gm-api/src/types.ts`
- scene lifecycle/reducer module
- classifier tests

Deliver:

- `sceneChange` (nullable) on the classifier;
- effective scene computed by the reducer during intent application;
- flat replacement behavior;
- malformed `sceneChange` degrades to stay;
- no typed scene for ordinary freeform turns.

### Phase 4 – Scene-aware prompt composition and completion

Files:

- `packages/dto/src/templates/PromptTemplates.ts`
- `packages/app/templates/scene-*.hbs`
- prompt migrations/seed data
- `apps/gm-api/src/prompts/prompts.ts`
- `apps/gm-api/src/prompts/chronicleFragments.ts`
- `apps/gm-api/src/gmGraph/nodes/classifiers/GmSummaryNode.ts`
- `packages/app/templates/gm-summary.hbs`
- `apps/gm-api/src/updaters/WorldUpdater.ts`
- prompt/graph tests

Deliver:

- scene policy composed with every intent narrator;
- scene fragment supplied to classifiers and post-processors;
- post-narration `continue|complete`;
- chronicle closure completes the active scene;
- turn records effective scene context.

### Phase 5 – Dialog vertical slice

Files:

- dialog policy template
- client scene stage components/styles
- client store/TurnView
- dialog WireMock fixtures
- GM unit tests
- Playwright journey
- `apps/client/src/data/changelog.json`

Journey:

1. Player types a natural approach to a named NPC.
2. Intent starts `dialog` with `{subject, subjectKind: npc}`.
3. The same turn uses dialog policy.
4. UI switches to speaking-head presentation.
5. Follow-up free text stays in dialog and receives NPC-grounded replies.
6. A farewell/departure resolves in dialog and `gm-summary` completes it.
7. UI returns to normal freeform presentation on the next turn.

Also test dialog -> battle replacement from natural-language violence.

### Phase 6 – Battle vertical slice

Deliver:

- battle policy and action-pressure stage;
- heavy battle check rules;
- battle completion and battle -> chase/dialog transitions;
- no numeric scene clock yet unless implemented as part of this phase;
- changelog update extends the scene-types entry rather than adding a duplicate.

This proves the architecture supports a mechanically strict type, not only a
presentation-heavy type.

### Phase 7 – Hunt, chase, and search

Implement one type at a time. Each must include:

- allowed subject-kind validation;
- policy template;
- presentation component;
- classifier fixtures;
- check-planner tests;
- lifecycle E2E;
- explicit completion and replacement cases.

Do not land all three behind generic tests.

### Phase 8 – Play-data review

Measure:

- scene start/replace/complete frequency by type;
- turns per scene;
- classifier corrections from feedback;
- checks per scene type;
- scene replacements that appear premature or late;
- dialog turns incorrectly routed to generic narration;
- typed scenes that never complete;
- user feedback tied to scene context.

Use that evidence before adding scene clocks, nested scenes, portraits, or
additional scene types.

## Verification matrix

### DTO/unit

- `SceneType` parses and `subjectKind` reuses `HardStateKind`;
- `activeScene` is nullable and defaults to null;
- the reducer maps `sceneChange` (null / new / same / different) to
  stay / start / continue / replace;
- a malformed `sceneChange` degrades to stay rather than throwing;
- `sceneChange` round-trips inside `player_intent`;
- minimal `sceneContext` parses and carries type, subject, taxonomy kind, scene
  id, and turn outcome.

### GM graph

- freeform turn with no active scene is unchanged;
- typed scene starts on the triggering turn;
- active scene persists across turns when `sceneChange` is null;
- a different-type/subject `sceneChange` replaces the active scene;
- check planner receives and obeys heavy scene policy;
- narrator receives intent + scene policy;
- GM summary completes only the effective scene;
- chronicle closure completes the active scene.

### Persistence

- old chronicle normalizes to no active scene;
- the active scene survives reload;
- a turn's `sceneContext` survives reload from the dedicated jsonb column;
- a turn's `sceneChange` also survives reload inside `player_intent`;
- duplicate turn commit remains idempotent;
- rollback removes only the added `scene_context` column.

### Client

- no stage when no scene is active;
- correct stage for each type;
- historical dialog entries retain the NPC label;
- scene replacement changes the stage immediately after the turn commits;
- keyboard and screen-reader order remain Chronicle Header -> Scene Stage ->
  Transcript -> Composer;
- reduced-motion behavior remains intact.

### E2E

- freeform baseline;
- dialog start/continue/complete;
- dialog -> battle;
- battle complete;
- hunt -> chase;
- chase -> dialog or battle;
- search complete;
- search -> battle discovery;
- chronicle wrap while a typed scene is active.

## Risks and boundaries

### Classifier overreach

Heavy bias must not cause the intent classifier to invent scene transitions on
minor tone changes. Default to a null `sceneChange`; require concrete fictional
evidence to enter or switch a typed scene. Lock this with prompt-contract tests
and feedback review.

### Prompt contradiction

Scene policies and intent prompts can conflict. Keep intent responsibility
explicit and scene responsibility explicit:

- intent controls the player's requested operation and timeline semantics;
- scene controls local rules, voice, pressure, and completion.

Do not solve contradictions by adding fallback prompt selection.

### Subject drift

When `sceneChange` is null, retain the stored subject verbatim. Do not ask the
model to restate it. A subject changes only when `sceneChange` names a new one.

### Portrait scope

Do not scrape or guess images. The speaking-head frame ships with a
deterministic visual identity based on the subject name. Canonical portraits
require a separate entity-media design.

### Scene proliferation

Do not add a new type because one prompt needs a tone variation. A scene type
earns a place when it changes at least:

- check policy;
- narration policy;
- completion policy;
- client presentation.

Otherwise use tone or the existing intent prompt.

## Completion criteria

The first release is complete when:

- dialog and battle both work end-to-end;
- freeform turns remain unchanged when no typed scene is active;
- transitions are inferred from natural text with no player command surface;
- scene policy materially changes classifier/check/narrator behavior;
- dialog shows the generalized subject in speaking-head UI;
- every turn persists its governing scene context;
- flat replacement and completion survive reload;
- targeted DTO, GM, worldstate, client, and Playwright suites pass;
- lint remains warning-free;
- the bundled changelog records the user-facing scene behavior.
