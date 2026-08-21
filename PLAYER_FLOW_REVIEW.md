# Player Flow Review: Character → Chronicle → Turns → Close

Scope: the full player path (character creation, chronicle wizard, turn-by-turn play,
chronicle end), plus the machinery behind it (gm-api graph, chronicle-api, webservice
progress stream, chronicle-closer, client stores). Findings grouped by kind, ranked
within each group. File references are current as of this review (2026-08-21).

## 1. Broken contracts

### 1.1 Beat identity mismatch — beats can never advance or resolve
The beat-tracker LLM is shown beats via `trimBeatsList`
(`apps/gm-api/src/prompts/contextFormaters.ts:25`), which emits
`{description, slug, status, title}` and **drops `id`**. But `BeatUpdateSchema.beatId`
demands "an existing beat ID" (`packages/dto/src/narrative/ChronicleBeat.ts`), and
`beatUpdater.ts:33-42` matches `update.beatId` against `beat.id` (snake_case title),
while the visible `slug` is `beat_<id>_<turnId8>`. A model that echoes what it was shown
always lands in the "Got update for non-existent beat" warn path. Same for `focusBeatId`.
Net effect: beats spawn but never advance/resolve server-side.

Compounding issues:
- Client `applyBeatTrackerUpdate` (`apps/client/src/stores/chronicleStore.ts:224`)
  duplicates `beatUpdater` with a *different* id algorithm (hyphen slugify vs
  `toSnakeCase`), so optimistic beats diverge from persisted ones until rehydrate.
- `ChronicleBeat.resolvedAt` is set only client-side, never persisted.
- `BeatUpdate.changeKind` is ignored by the server (badge copy only).
- No beat is ever seeded at chronicle creation (`ensureChronicle` hardcodes
  `beats: []`); the SessionManager copy "The GM will establish the opening beat after
  the first turn" only holds if the tracker chooses to spawn one.
- `BeatDetectorNode` is not gated on `beatsEnabled` — a wasted LLM call per turn when
  beats are off (`BeatDetectorNode.ts:31`).

### 1.2 Chronicle location name is fabricated from the title
The wizard sends `locationId` only. `resolveLocationName` in
`apps/chronicle-api/src/router.ts:338-346` ignores `locationId` and falls through to
`` `${title} Locale` ``; `ensureChronicle` stores that verbatim
(`packages/worldstate/src/chronicleStore.ts:71-103` — no lookup). Every wizard-created
chronicle starts at a place named "<title> Locale" instead of the location the player
picked. The location pill, GM prompts, and closure events all carry the fabricated name.
Fix direction: resolve the entity name server-side, or have the client pass
`location: { locale: selectedLocation.name }` alongside `locationId`.

### 1.3 Closure event is emitted before the turn commits
`gmEngine.ts` publishes `ChronicleClosureEvent` *before* `commitTurn`; the only guard is
`DelaySeconds: 5` on the queue. If the commit throws, an event for a never-closed
chronicle is in flight → 5 failed receives → DLQ. Also in the closer:
- `infrastructure/terraform/sqs.tf` sets queue visibility 60s == Lambda timeout 60s,
  with `batch_size = 5` and two sequential LLM calls per record — guaranteed duplicate
  delivery under load.
- `apps/chronicle-closer/src/handler.ts:34-37` caches a rejected init promise
  (`processorPromise ??= …`), permanently bricking a warm container after one init failure.

### 1.4 Closure publishes the live session character into shared state
`processor.ts:157-167` writes the **full session character** (inventory, skills,
momentum) into the shared `character` table when appending the bio, because
`getChronicleState` returns `session.character_state ?? canonical`. The changelog entry
explicitly claims summaries persist "without publishing live-session changes into shared
world state" — the code contradicts the stated contract.

### 1.5 Client turn-sequence divergence permanently kills progress correlation
`sendPlayerMessage` increments `turnSequence` optimistically before the mutation and
never rolls it back on a thrown error (`chronicleStore.ts:802-813`, catch at :906-919).
After one failed submit, the client's computed `jobId` (`chronicleId#N`) is ahead of the
server's forever (rehydrate fixes it). All websocket progress for subsequent turns is
silently dropped, because the jobId gate takes precedence
(`applyTurnProgressEvent`, :333-339).

### 1.6 `setChronicleTargetEnd` races turns and works on closed chronicles
`apps/gm-api/src/router.ts:43-66` does a non-transactional `getChronicle` →
`upsertChronicle` of the *whole* record; a concurrently committed turn's `beats`,
`entityFocus`, or `summaries` can be clobbered. It also lacks the `closed` guard that
`postMessage` has.

### 1.7 Wrap-up has no hard stop
`wrapFragment` computes `turnsLeft = targetEndTurn - turnSequence` with no clamp — it
goes negative indefinitely — and nothing in `gmEngine` forces closure when the target
passes. Ending depends entirely on the gm-summary LLM returning
`shouldCloseChronicle: true`. A wrap request can silently never finish.

### 1.8 Character creation trusts the client completely
`createCharacter` accepts a full client-authored `Character` (id, attribute tiers,
skill tiers, momentum) and stores it wholesale (`apps/chronicle-api/src/router.ts:71`).
There is no point-buy budget or server-side validation beyond schema shape — a player
can start with every attribute at max tier. Acceptable for a prototype, but it is the
only place in the flow where game balance is client-defined.

## 2. Unconnected and write-only features

### 2.1 Chronicle summaries and character bios are generated, paid for, and never shown
The closure pipeline works end-to-end (event → chronicle-closer → two LLM generations →
`chronicle.summaries` + `character.bio` persisted). **Nothing reads either.** No client
surface renders summaries (ChronicleOverview has no summaries panel), `bio` is never
referenced in the client, and no completion signal tells the client the async summaries
landed. This is the natural payoff moment of the whole loop — a finished story — and it
is invisible.

### 2.2 There is no end-of-chronicle experience
On closure the composer disables with the banner "Chronicle closed. Offline
reconciliation in progress. Messaging disabled." (`ChatComposer.tsx:105`) — the copy is
wrong (nothing reconciles offline; the condition conflates closure with a
never-assigned `connectionState === 'closed'`). The landing page labels the chronicle
"Completed" but offers "Resume" into a read-only chat. No epilogue, no story summary,
no character-growth recap.

### 2.3 The turn-progress stream is built end-to-end and the UI ignores it
gm-api emits per-node start/success/error events through SQS → webservice → websocket,
~22 awaited SQS publishes per turn on the critical path. The client:
- discards all `start` events and never reads `status`, `step`, `total`, or `nodeId` —
  the only in-turn UI is a generic spinner ("GM is composing the next beat…");
- treats `error` events identically to success;
- has a subscribe race (subscribe fires as the mutation starts; early events hit zero
  targets and are dropped — no replay);
- loses the subscription permanently on token refresh mid-turn
  (`useProgressStreamConnection` reconnect clears subscriptions and nothing
  re-subscribes `pendingTurnJobId`);
- gets no terminal "turn complete/failed" event; completion is inferred from the tRPC
  promise alone.
Also: the webservice event-source mapping omits `ReportBatchItemFailures` (a poison
record re-pushes a whole batch up to 5×), and the graph-failure system message can only
arrive via tRPC (never streams). Decision needed: either invest (render node progress,
fix the races, add a terminal event) or cut the stream and its infra — the current state
pays full cost for a spinner.

### 2.4 Offline queueing is fiction
`isOffline` and `queuedIntents` are never set to anything but `false`/`0`, yet
`ChatComposer` renders an offline banner ("intents will queue and send once online")
and a "Queue Intent" button label for them. `connectionState === 'closed'` branches in
ChatComposer and ChronicleHeader are equally unreachable.

### 2.5 The Atlas location link can never appear
`LocationOverview` gates its Atlas link on `locationSlug !== null` — but nothing in the
client ever sets `locationSlug` (grep: only read and cleared). The "links to the Atlas
while the chronicle is still where it began" feature (per the changelog) is dead on
arrival. The `startedAt` comparison is also wrong after reload: it compares against
`chronicleRecord.locationName`, which play mutates.

### 2.6 emergentTags / lore tags: recorded "for later canon review" that doesn't exist
- `entityUsage.emergentTags` are generated每 turn and persisted; the only consumer is a
  client chip list. No canon-review job, ingest, or moderation surface reads them.
- `beatTracker.tags` (`lore:anchor/entity/tag`, built in `BeatTrackerNode.ts:31-41`)
  are persisted and read by nothing.
- `entityFocus.lastUpdated` is written, never read.

### 2.7 lore-judge is dead but user-editable
`lore-judge` has a template, a DTO descriptor, a messageOrder entry, and a WireMock
stub — but no node uses it, and it is missing from `templateFragmentMapping`, so
`buildPrompt('lore-judge')` would throw. Meanwhile it appears in the TemplateDrawer and
audit filters, so players can edit a prompt that never runs. Either wire it or delete
template + descriptor + messageOrder entry.

### 2.8 Dead fields and vestigial config
- `Turn.resolvedIntentType` / `resolvedIntentConfidence`: never set by gm-api
  (`#buildTurn` omits them); `resolved_intent_type` column is always null;
  `resolvedIntentConfidence` is never emitted anywhere. The progress payload's
  `resolvedIntentType` is just an alias of `playerIntent.intentType`.
- `GraphContext.shouldUpdate`: initialized false, never read or written again.
- `GraphContext.systemMessage`: never assigned inside the graph, so the websocket
  `systemMessage` payload branch is unreachable.
- Client store: `recentChronicles` (only ever filtered), `locationSlug` (see 2.5).
- `apps/webservice/src/services/env.ts` `cognitoConfig`: exported, never imported.
- Terraform grants chronicle-api both the closure queue (env + `sqs:SendMessage`) and
  the progress queue — chronicle-api uses neither; both emitters live in gm-api.
- `dead try/catch` around `TurnProgressEmitter` construction (cannot throw).

### 2.9 Tone step data mostly evaporates
Wizard tone chips/notes feed only seed *generation*. They are not stored on the
chronicle and never reach turn narration (per-turn tone comes from the intent
classifier). With a custom seed, the tone step does literally nothing. Either persist
tone on the chronicle and feed it to narration prompts, or drop the step.

### 2.10 Local dev cannot exercise closure
The closure queue is created locally and gm-api publishes to it, but no local process
runs the closer handler — summaries are never generated outside deployed AWS. The
webservice devServer also throws at import without `TURN_PROGRESS_QUEUE_URL`, breaking
bare `pnpm dev`.

## 3. Overcomplication and duplication

1. **ChatMessage extras sprawl.** ~18 nullable per-message fields threaded through five
   merge sites (`toChatMessage`, `upsertChatEntry`, `flattenTurns`,
   `sendPlayerMessage`, `applyTurnProgressEvent`). Every field addition/removal touches
   all five (the recent `handlerId` removal demonstrated this). Turn-level data
   (skill check, beat tracker, entity usage) belongs on a Turn view-model keyed by
   `turnId`, with messages referencing it.
2. **Entity focus recomputed client-side with different weights.**
   `ChronicleOverview.tsx:382-431` re-derives scores (central=3/mentioned=1) from the
   last 20 messages while the canonical `chronicle.entityFocus` (central=8/mentioned=3,
   decay 0.9) sits unused in `chronicleRecord`. Violates the repo's own
   canonical-field rule and shows players different numbers than the GM uses.
3. **Two `PromptTemplateRuntime` classes** (`apps/gm-api/src/prompts/templateRuntime.ts`
   with caching, `apps/chronicle-api/src/services/templateRuntime.ts` without). Belongs
   in a shared package per the layering rules.
4. **Dead store action:** `createChronicleForCharacter` has no caller; the server's
   `location: {locale}` input path and the title-based `resolveLocationName` fallback
   exist only to serve it.
5. **Wizard duplicate fetch:** `refreshLocations` and a near-identical inline
   `useEffect` both load locations (`ChronicleStartWizard.tsx:89-133`).
6. **Turn cost:** up to 9 LLM calls per turn (intent, beat-detector, check-planner,
   narration, entity-judge, beat-tracker, gm-summary, inventory-delta, location-delta)
   plus ~22 awaited SQS publishes. Worth an explicit latency/cost budget.
7. **createChronicleHandler timing logs** (`logTiming` at each step) read as leftover
   debugging instrumentation.

## 4. UX walkthrough notes

- **Character creation:** the modal hint "Characters begin at the at-home staging
  location with neutral momentum" references a staging location that no longer exists
  in the model (location is chosen per-chronicle). No inventory step, and since
  inventory-delta only applies narration-explicit changes, characters can play whole
  chronicles with an empty inventory panel.
- **Wizard:** the anchor step is de-facto mandatory (Next disabled without one; a
  no-neighbor location says "go back") while the Create summary calls it
  "(optional)" — and the stepper's direct navigation bypasses the gating entirely,
  making the two paths inconsistent. Anchor candidates are capped at 3. The seed
  "Generating seeds (n/3)…" counter is a simulated timer, not real progress. A typed
  custom seed silently overrides a selected seed card.
- **Turn play:** the chronicle seed appears as a pseudo-GM message only while the
  transcript is empty — it vanishes from history after the first turn (hydrate only
  prepends it when there are no turns). Skill-progress badges and the momentum trend
  are client-derived diffs that disappear on reload. The feedback modal's intent
  dropdown omits `wrap` (`ChatCanvas.tsx:43-50`).
- **Landing page:** two "In development" panels — "Recently completed" renders a
  hardcoded fixture feed (`data/landingFeed`), "Online players" is a placeholder for a
  presence service. Fine if intentional; both predate the current single-player shape.
- **Stale docs:** the root `CLAUDE.md` subproject overview lists `apps/llm-proxy`
  (deleted) and describes `apps/chronicle-api` as running storytelling logic and skill
  checks (now gm-api); gm-api, chronicle-closer, atlas-api, prompt-api,
  world-schema-api, and db-provisioner are absent. Stray `CODE_REVIEW.md`,
  `STORAGE_AUDIT.md`, `PLAYWRIGHT_TESTING.md` live in `apps/`.

## 5. What is solid

- Layering holds: DTOs in `packages/dto`, persistence in `packages/worldstate`, no
  domain logic bleeding into app folders on the paths reviewed.
- The entityFocus loop is genuinely closed (judge → scores with decay → selector
  ranking → context slice) and now test-covered.
- Momentum and skill XP are real server-side loops (resolver → characterUpdater →
  persisted → fed back into rolls), though XP only accrues on failure outcomes
  (`collapse` +2, `regress` +1) — flag as intentional-or-not.
- Auth checks (`requireCurrentPlayer`, ownership guards) are consistent across
  player-scoped endpoints.
- The closure pipeline itself (event → handler → summaries → idempotent persist under
  row lock) is competently built; it just has ordering/infra bugs and no consumer.

## 6. Suggested priorities

1. Fix beat identity (expose `id` to the tracker prompt or match on slug; unify client
   and server beat synthesis; persist `resolvedAt`) — beats are a headline feature that
   currently cannot work.
2. Fix chronicle `locationName` resolution from `locationId`.
3. Build the chronicle-end payoff: an epilogue view rendering `chronicle.summaries` and
   the updated bio, correct closure copy, and a "summaries ready" signal (or a refetch).
4. Decide the progress stream's fate: render real node progress + fix the subscribe
   race and reconnect, or delete the stream and its infra.
5. Closure ordering + infra: emit after commit, visibility ≫ timeout, batch size 1-2,
   uncache failed init.
6. Delete the fiction: offline-queue UI, `connectionState 'closed'`, lore-judge,
   `resolvedIntent*`, `shouldUpdate`, `recentChronicles`, dead terraform grants,
   `createChronicleForCharacter`.
