# World Agency — Implementation Plan

Give the world a life the player does not cause. Today every event in a chronicle is a
reaction to a verb the player supplied: across all seven turns of Shadows of the Deep the
piston jams when she fires it, the vortex opens when she accelerates, the signal appears when
she scans. No third party ever acts on its own account. This adds a stage where the GM plays
the environment — everything that is not the player — backed by persistent agendas that carry
their own clocks.

Out of scope: chronicle-closer changes, canon authoring, any second migrations directory.

## Confirmed decisions

- The environment stage runs **before `check-planner`**, as its own pipeline node. The world
  moves first; the player's action is then planned and rolled against the situation as it now
  stands. Folding it into the scout was rejected: the scout runs after the dice and holds
  `SKILL-CHECK`, so a model there writes world action as consequence of the player's roll,
  which is the reactive failure this feature exists to fix.
- Its output is **kept, not just consumed**. A `world` text lands on the turn beside the
  player message and the GM narration, and the turn record the models read becomes
  `P:` / `W:` / `G:` / `C:`. The world's life accumulates in the transcript on turns where the
  narration never turned to look at it, and `search_history` can reach it later.
- **The writer receives the world text and is not required to use it.** The world does what it
  does; the narration shows what the camera catches. A front that stirred quietly this turn is
  recorded and lands later. This is the mechanism that manufactures surprise without the GM
  announcing itself.
- **Fronts** are the persistent GM plan: an agent (a canon entity), an intent, a clock, and the
  next visible sign. At most **three live at once**. They **tick every turn** and **fire only
  when a clock fills**, at most one firing per turn.
- **Clocks move from fiction, not from dice.** The environment stage and the turn judge move
  them from what happened — information revealed, position lost, attention drawn, time spent.
  The existing `advanceSceneClock` tier mapping stays for checked turns and stops being the
  only way a scene can move; this is what fixes a scene of pure conversation sitting at the
  same number for its whole life.
- **A front may only be created from a canon entity that already has a stake.** The environment
  stage reads the *field names* on entities in play — the whole descriptive identity surface,
  not a hardcoded three — and opens what bears on the moment, the same discipline the scout
  uses. What the world does comes out of canon, never out of weather.
- **A front changes the situation, never the resolution.** The player's stated action always
  does exactly what they said it does. What a firing front changes is what the world looks
  like when they are done: who arrived, what closed, what is now known. "You pick the lock"
  never becomes "you fail because the front fired"; it becomes "you pick the lock, and the
  yard boss is already in the doorway."
- **Both front state and world text render in the UI**, gated at the existing `all` visibility
  level. Every alpha player is a developer and should be able to inspect turn state without
  opening the database.

## Context / reuse map

Verified against the working tree (2026-08-26).

**Pipeline** — `GM_PIPELINE` (`apps/gm-api/src/gmEngine.ts:68`) is now intent-classifier →
scene-subject-resolver → player-entity-reference-resolver → check-planner → check-runner →
gm-response-node → [inventory-delta, turn-judge]. The environment stage inserts between
player grounding and `check-planner`. Nodes are registered in `#createGraph`
(`gmEngine.ts:255`).

**Chronicle-scoped state** — `chronicle.props` is jsonb and already carries `beats`,
`sceneLedger`, `activeScene`, `entityFocus`, `summaries`, `toneChips`. Fronts belong here;
**no migration is needed for them**. Beat and ledger updaters to mirror:
`apps/gm-api/src/updaters/beatUpdater.ts`, `apps/gm-api/src/scenes/sceneLedger.ts`.

**Turn persistence** — `chronicle_turn` columns are written by
`packages/worldstate/src/chronicleTurnPersistence.ts`; the `Turn` DTO is
`packages/dto/src/narrative/Turn.ts`. The world text needs a real column, and the FTS
`search` column (`db/migrations/011_turn_search.sql`) is `GENERATED ALWAYS AS` over
`gm_summary`/`player_message_content`/`gm_response_content`, so adding world text to search
means dropping and recreating that generated column. **One migration, 013**, doing both.

**The turn record models read** — `recentEventsFragment`
(`apps/gm-api/src/prompts/chronicleFragments.ts:326`) builds the `P:`/`G:`/`C:` lines, keeps
the last ten turns and the last five narrations verbatim, and caps an oversized player message
via `recordedPlayerMessage`. The `W:` line joins here. The block is described in three
templates (`intent-classifier`, `turn-judge`, `check-planner`) whose legends must match.

**Scene clock** — `advanceSceneClock` and `CLOCK_STEPS`
(`apps/gm-api/src/scenes/sceneLifecycle.ts:84`), with `applySceneRead` already folding the
scout's `stakes`/`endsWhen`/`changed` onto the scene and counting `quietTurns`. `quietTurns` is
computed and persisted today and **nothing reads it** — the environment stage is its first
consumer.

**Retrieval substrate** — the scout's tools (`apps/gm-api/src/proseAgent/tools.ts`) already
cover identity, relationships, expand, search, lore, and history against slugs. The
environment stage reuses them unchanged; `buildTocEntries` / `renderWorldIndex`
(`proseAgent/seedPack.ts`) give it the same index shape.

**Client** — `TurnView` (`apps/client/src/state/chronicleState.ts:37`) is the per-turn shape the
chat renders; `ChatCanvas` reads it and keys progress labels off node ids
(`PROGRESS_NODE_LABELS`). Visibility is a four-level ladder — `none` < `badges` < `narrative` <
`all` — stored at `app.player.preferences.feedbackVisibility`, defaulting to `all`, gated by
`FeedbackVisibilityGate minimum="…"` / `useFeedbackVisibility().isAtLeast(…)`
(`apps/client/src/components/feedbackVisibility/FeedbackVisibilityGate.tsx`). The `all` level's
own description already promises "world deltas, and pipeline traces", so world text and front
state hang off `minimum="all"` rather than needing a new toggle. Turning them off individually
would require moving the enum to independent flags; that is deliberately not in this plan.

## Cross-cutting constraints

- `db/migrations` is the only schema source; exactly one new migration (013), never editing an
  applied one.
- DTO shapes go in `packages/dto`; persistence reads in `packages/worldstate`; no domain logic
  in app folders where a shared module exists.
- The environment stage runs on the prose model with tools and goes through the existing
  budget reserve/settle and audit fan-out, like every other call.
- Loop bounds and front caps are hardcoded sane defaults, not environment variables.
- Lint-clean at every milestone; a changelog entry when the feature is player-visible.

## Milestones

### W0 — Front state and the world record
The data, with nothing yet writing it.
- `Front` DTO: agent entity slug, intent, clock (`filled`/`size`), next visible sign, status,
  `createdAtTurn`. Fronts array on the chronicle props shape.
- Migration 013: `chronicle_turn.world_content text`, and the FTS `search` column recreated to
  include it at weight `B` beside the player message.
- `Turn` DTO and `chronicleTurnPersistence` carry `worldContent` through commit and read.
- Exit: `make ci` green; a worldstate test round-trips a turn with world text and finds it via
  `searchTurns`.

### W1 — The environment stage [depends on W0]
The GM plays everything that is not the player.
- New node between player grounding and `check-planner`, running the prose model with the
  scout's tool set and its own short instructions: read what is present and what stands
  offscreen with a stake, tick the live fronts, and say what the world is doing right now.
- Structured output: `world` text, per-front clock movement with a reason, at most one
  `fired` front, and up to one new front proposed from a canon entity.
- Deterministic application: clocks move, a filled clock fires and the front resolves or
  respawns, the cap of three is enforced, invalidated fronts are pruned.
- `quietTurns` and beat `lastProgressTurn` are inputs: a scene that has not moved and a beat
  the story has been away from both raise the pressure to spend a front.
- Exit: `make ci` green; a dev-harness turn produces world text, a front tick, and audit rows.

### W2 — The world in the record and in the prompts [depends on W1]
- `recentEventsFragment` emits `W:` beside `P:`/`G:`/`C:`; the three template legends that
  describe the block are updated to match.
- The writer receives the world text in its brief and may use it; the scout receives live
  fronts as retrieval hints, never as its entity universe.
- Fiction-driven scene clock: the turn judge moves the scene clock from what happened, with
  the check tier remaining one input rather than the only one.
- Exit: `make ci` green; a composed prompt test shows a `W:` line and the front block.

### W3 — Turn state visible in the client [depends on W2]
- `TurnView` carries `worldContent` and the turn's front state; both render on the expanded GM
  message behind `FeedbackVisibilityGate minimum="all"`.
- Progress label for the new node.
- Changelog entry; the visibility ladder's `all` description already covers this, so no copy
  change is required.
- Exit: `make ci` green; a live turn shows world text and front clocks in the chat.

### W4 — Tuning window [depends on W3]
- Read live turns for firing rate, whether world text reads as intent or as weather, and
  whether narration incorporates fired fronts without overriding player actions.
- **[DECISION]** Firing rate and clock sizes.
- **[DECISION]** Whether the environment stage needs its own model tier separate from prose.
- Exit: your call on both; no code gate.

## Decisions needing your input

| Where | Decision you own |
| ----- | ---------------- |
| W4 | Front firing rate and default clock size |
| W4 | Whether the environment stage stays on the prose model or gets its own tier |
| Later | Whether visibility becomes independent flags rather than one ladder |
