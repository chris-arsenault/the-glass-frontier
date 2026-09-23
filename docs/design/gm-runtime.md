# GM runtime: retrieval, threads, and scenes

Reviewed against `64d7fa4` on 2026-09-21. This is the implemented architecture
that replaces the root prose-retrieval and world-agency plans.

## Turn graph

[`GM_PIPELINE`](../../apps/gm-api/src/gmEngine.ts) runs these stages:

1. Intent classification projects thread focus and the scene transition.
2. Player entity references are resolved; direct catalog attachments are already
   resolved through their owning stores.
3. Check planning and check execution establish the mechanical outcome.
4. The prose agent researches and writes the canonical narration.
5. Inventory, location, and narrative-boundary reads run in parallel.
6. Thread position, local continuity, and world agency run in parallel using
   those completed results.
7. The engine applies valid updates, derives the roster, builds the turn, and
   persists through the Chronicle store. Closure events use the existing queue.

Steps after narration are advisory. A malformed or failed projection cannot
discard completed prose. A failure before narration still follows the ordinary
failed-turn path. The primary model's narration is the only comparison output
that drives state.

## Research and writing

[`runProseAgent`](../../apps/gm-api/src/proseAgent/index.ts) builds a seed pack
with explicit player-character context, the scene and goal, checks, recent
history, direct references, and a world index. The player character is never
substituted with an Atlas NPC.

The scout calls `search({ query })` and `open({ slug, offset? })` across Atlas,
Encyclopedia, and Chronicle history. Qualified slugs identify the source;
database UUIDs stay inside the implementation. Search provides leads and
excerpts. Opening a Chronicle turn supplies its stored player, GM, and world
prose rather than a shortened summary. Long records expose continuation offsets.

The research loop allows three search/evaluation iterations, with two tool-loop
steps per search invocation. A session counts approximately 8,000 retrieved
tokens and caps each rendered result at about 1,200 tokens. These are current
implementation limits, not promises of exhaustive retrieval. A separate
evaluator judges the actual retrieval record; a composer writes a prose brief,
and the classification model extracts `TurnBrief`. The writer receives the
composed brief plus its ordinary prompt context, without tools or the index.

If a research round fails, composition can still use material already collected.
If composition or extraction fails, the writer continues with an empty brief
and records `briefFailed`; that is distinguishable from choosing not to search.
Budgets, request audits, token usage, and progress use the existing LLM client
and tool-loop instrumentation.

Player attachments provide intentional full-record context independently of the
scout's choices. Sidecar claims resolve against served references. Final prose
is checked for exact entity and Encyclopedia mentions; Atlas spans take
precedence. Encyclopedia usage never becomes Atlas focus or a graph mutation.

Configured prose slots also produce observational comparisons: a tool-free
one-shot for each model and agentic output for secondary models. Those records
support same-model comparisons of retrieval against no retrieval. A panel
failure drops that comparison only. Current live quality remains an
[evaluation task](../../BACKLOG.md#evaluation), not a consequence of passing tests.

## Durable progression

`NarrativeThread` stores `id`, `title`, `owner`, `perspective`, `goal`, `position`,
and `updatedAtTurn`. Player threads preserve long-term goals; world threads
preserve independent agendas. `focusedThreadId` selects the current player goal.

`ActiveScene` stores `id`, `type`, `question`, `threadId`, and `turnsRemaining`.
Dialog, battle, hunt, chase, and search scenes have four consequential turns.
`action`, `planning`, and `wrap` consume a scene turn; inquiry, clarification,
possibility, and reflection do not. Opening a scene on a consequential turn
consumes its first turn immediately.

Leaving or replacing a scene preserves the outgoing scene for boundary updates.
Expiry requires narration to answer the question. A narrow post-narration
boundary read can close a scene early when its question is answered. Each
completed scene updates its own linked player thread, even if focus now names
another thread; replacement and early closure can update two different goals.

[`boundaryEvidence.ts`](../../apps/gm-api/src/scenes/boundaryEvidence.ts) reads
checkpoint-linked scene turns plus the current narration and checks. Local
continuity reads committed, successful turns since its previous note, including
inquiries. The note records its location and update turn. Summaries are display
aids and cannot substitute for that evidence.

## Independent world motion

At a scene boundary or established time passage, `EnvironmentNode` selects the
least recently updated world thread. It reads canon for the owner and resolved
location, relevant Encyclopedia context, completed narration, and recent world
prose. It writes one concrete development, updates that thread's position, and
persists the development as `Turn.worldContent`.

The following writer receives the preceding successful turn's world prose in
`WORLD-DEVELOPMENT`; historical retrieval can also recover older developments.
World movement therefore cannot change the completed check or require the same
turn's writer to anticipate a later result. Planning alone is not elapsed time;
the boundary reader determines whether the completed fiction establishes it.
An environment failure preserves the turn without fabricating world motion.

## Creation and historical state

Seed and opening calls allow 16,000 output tokens, clamped by model capability,
while prompt instructions govern prose length. Bedrock rejects truncated output
and records safe stop-reason and block-type diagnostics. This distinguishes
reasoning-budget exhaustion from a missing structured `SeedArray` response.

Old beats, fronts, and scene-ledger JSON can remain in historical records, but
current DTOs ignore those keys. New canonical fields receive safe defaults;
there is no old-to-new tracker translation. Migration 018 removed obsolete
relational tracker surfaces without rewriting Chronicle JSON.

Decisions: [ADR 0002](../adr/0002-qualified-retrieval-and-scout-writer.md) and
[ADR 0003](../adr/0003-threads-scenes-and-advisory-updates.md).
