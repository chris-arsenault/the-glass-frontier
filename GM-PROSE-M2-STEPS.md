# M2 — Agentic prose subsystem: execution steps

> Historical implementation record. The seed-pack sketch below predates the
> narrative-thread and bounded-scene contracts; consult the current DTOs and
> `seedPack.ts` before changing runtime code.

Expansion of M2 from `GM-PROSE-RETRIEVAL-V2-PLAN.md`. The subsystem is self-contained and
callable (`runProseAgent`), not wired into the live pipeline (that is M3). Settled inputs:
new `agent-*` template ids; loop bounds 5 steps / 8K retrieved tokens as constants; no test
spends money — mocked model in vitest, one manual dev script for live checks.

## ToC schema v0 — designed for iteration, not locked

Everything below lives in one module (`seedPack.ts`) as plain typed builders + a renderer;
iterating on shape during shadow means editing that module only. Nothing else in the
subsystem depends on the ToC's field list — tools address entities by slug/id, not by ToC
shape. Thick scene, light entities:

```ts
type SeedTocEntry = {
  slug: string; name: string; kind: HardStateKind;
  prominence: HardStateProminence; status?: HardStateStatus;
  blurb: string;                 // first sentence of description
  unwritten: boolean;            // veiled shell: hook-only policy applies
  identityKeys: string[];        // descriptiveIdentity key names, no values
  factKeys: string[];            // facts card key names
  relationships: Array<{         // from HardState.links, live + player-audience only
    verb: string; direction: 'out' | 'in';
    targetSlug: string; targetName: string;
    identityKeys: string[];      // relationship identity key names
  }>;
  loreCount: number;             // from listEntityStats
};

type SeedPack = {
  scene: { locationName: string; activeScene: ActiveScene | null; localContinuity: string | null };
  character: Character;          // rendered via the existing character fragment shape
  intent: Intent;                // intent, scene direction, thread direction, creative spark
  check?: { plan: SkillCheckPlan; result?: SkillCheckResult };
  playerReferences: EntityReference[];
  recentTurns: Array<{ seq: number; player: string; gm?: string; checkTier?: string }>; // last 10
  toc: SeedTocEntry[];
};
```

ToC seed collection (also one function, also iterable): roster entry ids + anchor +
canon-resolved location + scene subject + player-referenced entities, deduped.

## Steps

1. Sidecar DTO in `packages/dto`
   - File(s): `packages/dto/src/narrative/ProseAgent.ts` (new), export from the dto index.
   - Reference behavior: sidecar feeds `entityUsage` at M5; `EntityUsageEntry`
     (`packages/dto/src/narrative/EntityReference.ts:61`) is the downstream shape. The agent
     only reports used entities, so the sidecar omits `unused`.
   - Change: zod `ProseAgentSidecarEntry` = `{ entityId, usage: 'mentioned' | 'central',
     emergentTags: string[] }`; `ProseAgentResult` = `{ prose: string(min 1), entities:
     ProseAgentSidecarEntry[] }`. This schema is also the `submit_turn` tool input schema.
   - Verify: greenfield — a dto test parsing a valid payload and rejecting `usage: 'unused'`
     fails to compile until the schema exists, then passes.

2. `createAgentLoopClient` factory in `packages/llm-client`
   - File(s): `packages/llm-client/src/agentLoop.ts`, `src/index.ts`.
   - Reference behavior: mirror `createLLMClient` (`RetryLLMClient.ts:62`) — pool-based
     audit archive, token/model usage trackers, budget store.
   - Change: `createAgentLoopClient(options?: { pool?: Pool })` returning an
     `AgentLoopClient` wired with `LlmBudgetManager` + `LLMSuccessHandler`.
   - Verify: greenfield — unit test asserting the factory returns a client (construction
     only, no network) fails to resolve the symbol before, passes after.

3. Register the seven `agent-*` prompt templates
   - File(s): `packages/dto/src/templates/PromptTemplates.ts` (ids + descriptors),
     `packages/app/templates/agent-{action-resolver,wrap-resolver,inquiry-describer,
     clarification-responder,possibility-advisor,planning-narrator,reflection-weaver}.hbs`
     (new, seeded from the existing seven with retrieval-era wording: no "offered entities"
     phrasing), regenerated `db/migrations/seed/002_prompt_templates.sql` via
     `pnpm db:generate-seed`.
   - Reference behavior: descriptor shape at `PromptTemplates.ts:33`; the seed generator
     header (`scripts/generatePromptTemplateSeed.ts:6-17`) declares the templates dir the
     single source of truth. Check for exhaustive `Record<PromptTemplateId, …>` maps
     (e.g. `templateFragmentMapping` in `apps/gm-api/src/prompts/chronicleFragments.ts:49`)
     — if any is exhaustively typed, give agent ids an explicit empty entry rather than
     widening types; the agent path does not use `PromptComposer`.
   - Change: seven new ids + descriptors + `.hbs` files + regenerated seed.
   - Verify: red — a test asserting `PROMPT_TEMPLATE_DESCRIPTORS['agent-action-resolver']`
     exists fails before; green after. `make ci` confirms no exhaustiveness break.

4. Seed pack module
   - File(s): `apps/gm-api/src/proseAgent/seedPack.ts` (new).
   - Reference behavior: ToC schema v0 above. Data sources: `listEntitiesByIds` (HardState
     incl. `descriptiveIdentity` keys, `facts`, `links` with per-link identity keys and
     `live`), `listEntityStats` (loreCount), `findLocationByName` for the canon location.
     Rendering mirrors the `### FRAGMENT` style of `prompts/prompts.ts:148-170`; reuse
     `chronicleFragments` renderers (character, recent-events at `:305`) where the shape
     matches rather than reimplementing.
   - Change: `collectSeedIds(input)`, `buildSeedPack(input, worldSchemaStore)`,
     `renderSeedPack(pack): ModelMessage[]` — pure assembly + rendering, audience filters
     applied (live links only, no dm targets).
   - Verify: greenfield vitest with a stubbed `WorldSchemaStore`: the ToC entry for a
     stubbed entity lists identity keys but no identity values, relationship stubs carry
     target + identity key names, and dm-flagged targets are absent.

5. Tool session (executor state) module
   - File(s): `apps/gm-api/src/proseAgent/toolSession.ts` (new).
   - Reference behavior: plan's executor behaviors — per-result token caps with
     continuation handles, repeat suppression ("already provided in round N"), retrieved-
     token ledger (8_000 cap), triggered reminders (penultimate permitted round; ledger
     threshold). Token estimate: bytes/4, consistent with the budget manager's coarse
     estimation style.
   - Change: `ToolSession` tracking served material by key, running ledger, and current
     step (fed from `onStep`); `wrapResult(key, render)` applies dedupe/cap/reminder
     append.
   - Verify: greenfield vitest: second request for the same key returns a stub; a result
     exceeding the per-result cap is truncated with a continuation note; crossing the
     ledger threshold appends the budget reminder once.

6. Retrieval tools
   - File(s): `apps/gm-api/src/proseAgent/tools.ts` (new).
   - Reference behavior: M0 read surface — `getEntityBySlug`/`listEntitiesByIds`,
     `listRelationshipsAmong`, `listNeighbors`, `findEntityCandidates` (embedding via
     `context.embeddings`, `TitanTextEmbeddingClient`), `searchLoreFragments`,
     `listLoreFragmentsByEntity`, `listTurnWindow`, `searchTurns`. Corrective errors carry
     policy text (unknown entity → nearest canon names + unwritten-hook rule). `expand`
     returns the neighbor's ToC entry, not full material.
   - Change: zod tools `read_identity(slug, keys?)`, `get_relationships(slugs[])`,
     `expand(slug)`, `search_entities(query)`, `search_lore(query, slug?)`,
     `read_lore(ids[])`, `get_history(fromSeq?, toSeq?)`, `search_history(query)`, and
     `submit_turn` (input schema = `ProseAgentResult` from step 1; execute returns an
     acknowledgement — the loop captures the input as `finishToolInput`). All results pass
     through `ToolSession.wrapResult`.
   - Verify: greenfield vitest with stubbed store: `read_identity` returns only requested
     keys; `search_entities` miss returns nearest-name guidance; `expand` output contains
     key names, not identity prose.

7. Instructions assembly + `runProseAgent`
   - File(s): `apps/gm-api/src/proseAgent/index.ts` (new),
     `apps/gm-api/src/proseAgent/policy.ts` (new — code constants).
   - Reference behavior: instruction composition mirrors `prompts.ts:109-121` (base
     template + appended policies + scene-type policy via
     `scenes/sceneRegistry.ts` `getSceneTypeDefinition(...).promptTemplateId`). Policy
     constants replace `ENTITY_USAGE_POLICY` for the agent path: retrieval policy ("every
     response is a retrieval call or submit_turn"; unwritten-entity hook rule; sidecar
     provenance rule) and per-intent sufficiency checklists in the canon field vocabulary
     (dialog → manner/attitude/terms; checked action → hazards/risks/methods; inquiry →
     full identity + lore search; past-event reference → search_history).
   - Change: `runProseAgent(input, deps): Promise<ProseAgentOutcome>` — renders the
     `agent-<handler>` template for the intent type via `PromptTemplateRuntime`, appends
     policy + checklist + scene policy, builds seed pack + tools + session, resolves the
     prose model from `modelConfigStore` (category `prose`, must be Bedrock), calls
     `AgentLoopClient.run` (`maxSteps: 5`, finish tool `submit_turn`, `onStep` forwarded to
     the caller and to the session), parses `finishToolInput` with `ProseAgentResult`, and
     enforces provenance: every sidecar `entityId` ∈ seed ids ∪ ids served by tools this
     run (violators dropped, logged). Returns `{ prose, sidecar, stepCount, usage }`.
   - Verify: end-to-end vitest with the mocked model factory (pattern from
     `packages/llm-client/test/agentLoop.test.ts`): scripted rounds read_identity →
     submit_turn produce prose + sidecar; a sidecar id never served is dropped; a scripted
     text-only stop surfaces `agent_loop_incomplete`.

8. Manual dev script (no CI, no cost in tests)
   - File(s): `apps/gm-api/src/bin/proseAgentDev.ts` (new).
   - Reference behavior: worldstate `src/bin/` scripts are the repo's pattern for manual
     tsx entry points. Run: `with-cred -- npx tsx src/bin/proseAgentDev.ts <chronicleId>`
     against the dev DB + real Bedrock.
   - Change: loads a chronicle via `getChronicleState`, fabricates a player message from
     argv, runs `runProseAgent` with real stores + `createAgentLoopClient`, prints the
     seed pack, per-step tool trace, prose, and sidecar.
   - Verify: not CI-verified by design; smoke-run once manually before closing M2 (audit
     rows appear in `ops.audit_entry` for the run — the milestone's exit check).

9. Lint/CI closure
   - File(s): touched files above.
   - Reference behavior: repo guardrail — no new ESLint errors or warnings; `make ci` is
     the canonical gate.
   - Change: none beyond fixes.
   - Verify: `make ci` exit 0.

## Deferred (explicitly not M2)

- Wiring into the pipeline, progress emitter, and shadow rotation (M3).
- The intent-classifier "past-event reference" flag for the history reminder trigger
  (needs an intent schema change; checklist text covers it until then).
- GM span annotation, entityUsage/entityFocus feeds, roster derivation (M5).
