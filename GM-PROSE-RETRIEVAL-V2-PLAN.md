# GM Prose Retrieval V2 — Implementation Plan

Replace the pre-selected prose context in `apps/gm-api` with an agentic subsystem: the prose
model retrieves world canon, relationships, lore, and chronicle history through tools during
generation, and returns prose plus a structured entity-usage sidecar. Everything that prepares
the turn (intent, scene, checks) and everything that interprets and commits it (judges,
world updates, persistence, closure) is preserved. Out of scope: chronicle-closer redesign,
client UI redesign beyond progress labels, any second migrations directory.

## Confirmed decisions

- The retrieval loop runs on the prose model itself (one loop, tool rounds capped), for all
  seven intent handlers. A separate retriever-then-one-shot design is rejected.
- Replaced at cutover: `entity-selector` as prose-context provider, the one-shot
  `gm-response-node` call, `gm-entity-reference-resolver`, and `entity-judge`.
- Preserved unchanged: `intent-classifier`, `scene-subject-resolver`, `check-planner`,
  `check-runner`, `inventory-delta`, `turn-judge`, `WorldUpdater`, closure emission,
  `commitTurn`, audit/progress plumbing.
- `player-entity-reference-resolver` is preserved but re-grounded: it matches the player
  message against the global entity space (existing embedding search) instead of the
  50-candidate slice, and loses its `offered`/roster promotion side effect.
- The 7-entity roster stops constraining GM knowledge. It becomes a post-turn derived view
  (scene participants + sidecar usage) with unchanged persisted shapes, so the client panel,
  targeting chips, and chronicle-closer keep working without modification.
- `entityUsage`, `entityReferences`, `entityFocus` are fed from the agent's sidecar
  deterministically; GM-message span links come from exact/alias matching against sidecar
  entity ids (no LLM call).
- Indexing is minimal for MVP but the tool contracts must be extensible: existing entity
  embeddings for discovery, the existing (currently unqueried) `lore_fragment.search`
  tsvector, and one new migration for per-chronicle turn full-text search. Identity prose is
  read whole per entity, not indexed. Richer indexes (identity/lore embeddings) must be able
  to slot in behind the same tool signatures later.
- Evaluation is shadow dual-generation: v1 remains canonical while v2 runs on real turns;
  outputs are compared in the existing audit review UI; cutover removes the shadow
  scaffolding and the v1 prose path.
- The agent loop is not hand-rolled: it uses the Vercel AI SDK (`ai` +
  `@ai-sdk/amazon-bedrock`, Apache-2.0, no Vercel platform coupling, major version pinned)
  over the Bedrock Converse API — the standard `bedrock-runtime` endpoint and IAM already
  provisioned. Rationale: loop mechanics (reasoning-block round-tripping, parallel
  tool-call/result pairing, termination, transcript accumulation) are where
  unknown-unknowns live, so maintained SDK code amortizes them; and Converse is
  model-agnostic, which keeps the prose model a config/catalog value rather than an
  architecture commitment. Integration seams: `wrapLanguageModel` middleware for budget
  reserve/settle around every call, per-step request/response/usage for the audit archive
  (unchanged `ops.audit_entry` shape) and usage sinks, `onStepFinish` for progress events,
  `prepareStep` for the per-round `toolChoice` schedule. Classifier nodes stay on the
  existing `RetryLLMClient` unchanged.
- The prose model is a measured variable, not a design decision: the M3 shadow phase runs
  a bake-off (Claude Sonnet 5 baseline, Claude Haiku 4.5, Nova Pro v1; one Nova 2 Lite run
  to confirm unsuitability) on the same turns and tools, compared in the audit UI on prose
  voice, retrieval-trace quality, latency, and cost per turn. Prose-register instructions
  ("plain, concrete narration") are tested as a second lever in the same bake-off rather
  than assumed effective. Nova 2 Pro is excluded: preview-only, Forge-gated, output priced
  above Claude Sonnet.
- The harness division of labor is explicit: the SDK owns transcript mechanics; model
  reasoning (configured and preserved across rounds where the model supports it — Claude
  and Nova 2 tiers do, Nova Pro v1 does not) owns between-round deliberation; the
  M2 executor layer owns the information environment — ToC seed pack, engineered tool
  result views (per-result caps with continuation handles, corrective error text, repeat
  suppression), triggered reminders, per-intent sufficiency checklists, and `submit_turn`
  as the sole structured termination. That executor layer is the bulk of M2's effort and
  is tuned against shadow traces in M3/M4.
- Shadow output storage: no new table. Every agent LLM call is audited into the turn's
  existing `ops.audit_group` (`scopeType: 'turn'`), so the shadow prose and its tool trace
  are visible next to the canonical calls in the audit UI.

## Context / reuse map

Verified against working-tree code (2026-08-25).

**Pipeline** — `apps/gm-api/src/gmEngine.ts:64-77` (`GM_PIPELINE`), orchestrated by
`gmGraph/orchestrator.ts:175` (sequential fold, short-circuit on `failure`, parallel tail
group at `:215`). Prose is generated at a single site, `BaseIntentHandlerNode.execute`
(`gmGraph/nodes/IntentHandlerNodes.ts:100-147`), dispatched per intent type (`:63-72`),
prompt assembled by `PromptComposer.buildPrompt` (`prompts/prompts.ts:71`) from
`templateFragmentMapping` (`prompts/chronicleFragments.ts:49-60`). Post-graph:
`turnAssembly.ts` failure/narrative shaping, `updaters/WorldUpdater.ts:12`, roster refresh
(`gmEngine.ts:277-292`), closure (`gmEngine.ts:174-212`), `commitTurn`
(`packages/worldstate/src/chronicleStore.ts:356`).

**Current retrieval being replaced** — `entity/entitySelector.ts:127` over
`packages/worldstate/src/contextSlice.ts:175` (2-hop walk, ≤50 candidates, ≤7 offered,
`loreLimit: 2`); roster curation `packages/worldstate/src/entityRoster.ts:47`; stickiness
`entitySelector.ts:56-89`; focus scoreboard `entity/entityFocus.ts:50`.

**Hard contracts on the replacement** — downstream gates on `gmResponse` + `gmTrace`
(`IntentHandlerNodes.ts:127-131`); persisted turn fields `entityRoster`, `entityUsage`,
`entityReferences` consumed by chronicle-closer (`apps/chronicle-closer/src/canonHelpers.ts:126-230`)
and client annotation (`apps/client/src/components/layout/ChatCanvas/ChatCanvas.tsx:423-427`);
progress labels keyed by node id (`ChatCanvas.tsx:100-115`).

**Retrieval substrate (reused)** — `packages/worldstate/src/entityReader.ts:268` (by
id/ids/slug/exact-name/kind/neighbors), `relationshipReader.ts` (`listRelationshipsAmong`,
new, unexported, no consumer yet), `loreReader.ts:43`, `entityEmbeddings.ts:117`
(`findSubjectCandidates` hybrid graph+vector, `findReferenceCandidates` pure cosine; Titan
256-dim over name+kind+description; HNSW index from migration 006), `lore_fragment.search`
tsvector + GIN (`db/migrations/001_initial.sql:224`, never queried). Turn prose is fully
persisted (`chronicle_turn.player_message_content` / `gm_response_content` / `gm_summary`)
but only readable via whole-chronicle `list()` (`chronicleTurnPersistence.ts:197`).

**LLM layer (extended)** — `packages/llm-client/src/RetryLLMClient.ts:99,120`
(`generate`/`generateStructured` only; roles limited to user/developer at `types.ts:9-12`;
no tool loop, no streaming). Bedrock structured output already occupies `toolConfig`
(`providers/BedrockProvider.ts:100-121`); OpenAI uses `text.format`
(`providers/OpenAIProvider.ts:47-55`). Per-call budget reserve/settle
(`services/LlmBudgetManager.ts`), audit fan-out (`services/successHandler.ts:24`) keyed by
`metadata.nodeId`/`turnId` into `ops.audit_entry` grouped per turn (`AuditArchive.ts:57-78`).
Model resolution is two categories only (`packages/app/src/modelConfigStore.ts:146`); prose
default `claude-sonnet-5`, classification `amazon-nova-2-lite`
(`packages/app/src/modelCatalog.json`).

**Known asymmetries to respect in new read APIs** — `listNeighbors` does not exclude
`entity.dm` while `getContextSlice`/`listFocusChoices`/`findReferenceCandidates` do;
`listRelationshipsAmong` filters relation category `dm` but delegates entity-level audience
filtering to the caller; `EntityReader.#listLinks` ignores `live` while
`RelationshipReader` filters it. Agent-facing tools must apply consistent
player-audience filtering (`dm`, `is_article`, `veiled` handling per `entityOfferability.ts`).

## Cross-cutting constraints

- `db/migrations` is the only schema source; exactly one new migration (turn FTS), never a
  second migrations directory, never editing applied migrations.
- DTO shapes (sidecar, tool payloads crossing service boundaries) go in `packages/dto`;
  persistence reads in `packages/worldstate`; no domain logic in app folders where a shared
  module exists.
- No feature flags: the shadow phase is explicit temporary scaffolding with its removal as a
  cutover work item, not a config switch.
- Every LLM call in the loop goes through the existing reserve/settle budget path and audit
  fan-out; loop bounds (max rounds, max retrieved tokens) are hardcoded sane defaults, not env vars.
- Persisted `Turn`/`Chronicle` field shapes are frozen for this feature (closer and client
  depend on them).
- Lint-clean at every milestone; changelog entry at cutover (extend, don't duplicate).

## Milestones

### M0 — Worldstate retrieval APIs
The read surface the agent's tools will call, minimal indexes, extensible signatures.
- Turn-window read (`chronicleId`, seq range/limit) and per-chronicle turn text search;
  one migration adding a generated tsvector + GIN on `chronicle_turn` prose columns.
- Lore search over the existing `lore_fragment.search` tsvector (query-side only).
- Entity discovery search wrapping existing embedding + exact/alias name lookup behind one
  signature that can later take richer indexes.
- Export `RelationshipReader`; audience-consistent filtering (`dm`/`is_article`/`live`)
  across all new agent-facing reads.
- Exit: `make ci` green; new reader tests pass against migrated schema.

### M1 — Agent-loop client in `packages/llm-client`
Adopt the Vercel AI SDK over Bedrock Converse; wrap it in the repo's instrumentation.
- Step 0, gating spike, in dev against real Bedrock: multi-step `generateText` tool loop
  through `@ai-sdk/amazon-bedrock` — verify Claude reasoning blocks round-trip across tool
  steps on `us.anthropic.claude-sonnet-5`, and that Nova Pro v1 honors the
  `toolChoice: any` / forced-tool schedule.
- Thin `AgentLoopClient`: constructs the Bedrock provider, runs the multi-step loop with
  caller-supplied Zod tools, enforces step cap and output-token ceilings, applies the
  per-round `toolChoice` schedule via `prepareStep`.
- Instrumentation: `wrapLanguageModel` middleware for budget reserve/settle through
  `LlmBudgetManager` (rethrow on budget exhaustion); per-step audit/usage fan-out through
  the existing success-handler sinks keyed by `metadata.nodeId`/`turnId`, storing the
  step's request body and raw response in the current `ops.audit_entry` shape;
  `onStepFinish` emits retrieval-round progress events.
- Resolve the prose model id from the existing model category; no changes to
  `RetryLLMClient`, `IProvider`, or the classifier paths. Pin the `ai` major version.
- Exit: `make ci` green; spike documented in the plan; unit tests (mocked provider) cover
  multi-round loops, tool errors, step-cap termination, and budget exhaustion mid-loop.

### M2 — Agentic prose subsystem in `apps/gm-api` [depends on M0, M1]
A self-contained prose agent, callable but not yet wired into the live pipeline. The
executor/information-environment layer is the bulk of this milestone.
- Seed pack as a table of contents, not a summary: scene, character, check result, player
  intent and references, recent-turn summaries, plus an orientation index of scene
  participants/location/anchor listing identity **field keys** (no values), relationship
  stubs (verb + target + carried identity keys), and lore counts. The model selects from
  the visible index; open-ended search is only for off-scene references.
- Tools over M0 reads (amended after reviewing agents-of-glass and lorecraft as
  guidance, redesigned from first principles around context rot): every command bounded
  with required-only arguments, selective by construction — `read_identity(slug, keys)`
  (keys required; only chosen values enter the transcript), `read_relationship(slug,
  targetSlug)` (one edge), `expand(slug)` (neighbors' index entries, no content),
  `search(query)`, `search_lore(query)`/`read_lore(ids)`,
  `search_history(query)`/`read_turns(fromSequence)`, and `submit_turn({prose,
  entities})` as the only termination path (schema-validated sidecar, no separate judge
  call). The policy carries a Need→Tool routing table, an out-of-surface rule, and an
  explicit batching instruction: rounds are scarce but calls are not — select from the
  index, then open everything in one round of parallel calls.
- Round schedule (amended twice by the M1 spike, settled against the thinking docs): one
  uniform adaptive-thinking configuration for the whole loop, `tool_choice: auto` on every
  step, forced `submit_turn` only at the cap. Rationale: (a) forcing tool use never forced
  *retrieval* — `submit_turn` satisfies `required`, so forcing bought only text-stop
  prevention at the cost of un-deliberated selection (forced turns skip thinking);
  (b) manual `enabled` thinking errors on forced tool choice but adaptive supports it, so
  the forced cap step is legal; (c) the docs mandate one thinking configuration per
  assistant turn, and switching modes mid-loop breaks message-level prompt caching.
  Verified live: under auto + adaptive, Claude thinks before round-1 retrieval and before
  submitting. Instructions still forbid plain-text replies; a text-only stop surfaces as
  the loop's incomplete error, and retrieval-skip rate is a shadow-phase metric.
- Executor behaviors: engineered result views with per-result caps and continuation
  handles; corrective error text (unknown entity → nearest names + unwritten-hook policy);
  repeat suppression ("already provided" stubs); triggered reminders (penultimate round,
  token ceiling, unused history search when the intent flags a past-event reference);
  executor-enforced retrieved-token ledger.
- Instructions: per-intent templates preserved; `ENTITY_USAGE_POLICY` rewritten for
  discovered-not-offered entities; per-intent sufficiency checklists written in the canon's
  field vocabulary (e.g. dialog → manner/attitude/terms; checked action → hazards/risks/
  methods; inquiry → full identity + lore search; past-event reference → history search).
- Output contract: prose + `gmTrace` + sidecar (`entities: {entityId, usage, emergentTags}`,
  every id provably from seed or a tool result); sidecar DTO in `packages/dto`.
- Progress events per retrieval round through the existing emitter.
- Exit: `make ci` green; a dev-harness turn produces retrieval-backed prose with full audit
  rows and progress events.

### M3 — Evaluation panel [depends on M2] (amended: parallel panel, not rotation)
Run v2 on real turns without changing which narration drives the story.
- After the canonical prose completes, all panel models (Sonnet 5, Nova Pro, Nova 2 Lite;
  Haiku 4.5 once catalogued) run the agent subsystem in parallel with the same turn
  inputs. Panel responses are persisted on the turn (`prose_alternates`, migration 012)
  and every call lands in the turn's audit group; a panelist failure drops that response
  only and never fails the turn.
- The client pages through all responses on each expanded GM message (1/N with model
  labels); response 1 is always the canonical narrator, which alone drives world state.
- Exit: `make ci` green; all panel responses visible and cyclable in the UI, audit rows
  per panelist per turn.

### M4 — Shadow review window [depends on M3]
- Review per model/register variant: prose voice and readability, continuity, retrieval
  traces (keys offered vs opened, wasted rounds, history-search use), latency, cost per
  turn.
- **[DECISION]** Prose model and register-instruction selection from the bake-off.
- **[DECISION]** Cutover go/no-go, and any retuning of loop bounds/seed pack/checklists
  before it.
- Exit: your explicit model pick and go decision; no code gate.

### M5 — Cutover [CONTINGENT on M4 gate]
V2 becomes the canonical prose path; the compensating machinery is removed.
- Swap `gm-response-node` internals to the agent subsystem; delete the shadow scaffolding,
  `gm-entity-reference-resolver`, `entity-judge`, and `entity-selector`'s prose-context
  role.
- Feed `entityUsage`/`entityFocus` from the sidecar; deterministic GM span annotation;
  derived post-turn roster (unchanged persisted shapes); re-grounded player resolver
  (global candidates, no promotion); updated progress node labels in the client.
- Changelog entry; remove dead fragments/templates (`entity-judge`,
  `entity-reference-resolver` GM usage) from the template registry only if unreferenced.
- Exit: `make ci` green; full turn on dev exercises the new path end to end; closer and
  client panels verified against a closed dev chronicle.

### Decisions needing your input

| Where | Decision you own |
| ----- | ---------------- |
| M4 | Prose model and register-instruction pick from the shadow bake-off |
| M4 | Cutover go/no-go; final loop-bound/seed-pack/checklist tuning |
