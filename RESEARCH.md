# RESEARCH.md

## Phase Scope

Guide autonomous Sessions 1–10 through **market and contextual research** for *The Glass Frontier* while remaining fully aligned with the operating loop in `AGENTS.md`. Each session must leave a clear MCP trail (handoff, backlog updates, cached findings) that downstream phases can query without ambiguity.

Use `REQUIREMENTS.md` as the reference point for user-defined goals so research directly informs the baseline features and technical constraints expected in later phases, with special attention to the design intent shift toward freeform storytelling and the associated negative requirements.

## Design Intent Shift Research Targets

- Prioritize studies of cooperative GM-style narrative systems that enable open-ended player intent and variable scene duration, with emphasis on direct ChatGPT-like conversations augmented by hard memory context (character sheets, inventory, relationships, prior session summaries).
- Document best practices for feeding a continuously updated shared world without constraining narrative freedom; treat world consistency as secondary to creative expression unless safety or anti power-creep issues arise, and focus on offline post-session publishing pipelines rather than live-session writes.
- Investigate transparent success-check orchestration patterns where background services evaluate player input, execute rolls, and return results that the narrative engine can weave into responses without breaking immersion.
- Analyze UX patterns for sessions that can span hundreds of turns, including UI cues for narrative breakpoints and player-driven wrap-up signals.
- Investigate lightweight conflict deconfliction models as rare interventions rather than core loops.
- Capture evidence that text-action parsers or rigid verb gating harms the desired experience outside MUD hubs; ensure MUD research isolates hub-specific constraints.
- Audit approaches for enforcing prohibited capabilities and preventing reality-breaking powers from entering canon.
- Evaluate fully web-based client architectures that unify chat, overlays, account handling, and admin controls, staying within bootstrap cost envelopes.
- Compare self-hosted search/indexing stacks suitable for bootstrap phases and explicitly exclude managed services like Elasticsearch from recommendations.

## MCP-Integrated Session Workflow

1. **Handoff Synchronization**  
   - Load the previous report with `mcp__game-mcp-server__fetch_handoff`.  
   - Snapshot open research work by calling `mcp__game-mcp-server__get_top_backlog_items` (or `mcp__game-mcp-server__search_backlog_semantic` for scoped terms). Search/list calls now return partial records, so follow up by hydrating any candidate with `mcp__game-mcp-server__get_backlog_item` before making changes.
   - Revisit `REQUIREMENTS.md` to ensure current investigations cover the required gameplay, narrative, and technical surface area.

2. **Backlog Orchestration**  
   - Treat the research epic as an MCP **feature**: confirm `RES-CORE` exists via `mcp__game-mcp-server__list_features` (features are returned in priority order but only as partial records; hydrate with `mcp__game-mcp-server__get_feature` before editing, and when the current feature is finished select the next one using that ordering), update its scope when necessary (`mcp__game-mcp-server__update_feature`), or create it before Session 1 (`mcp__game-mcp-server__create_feature`).  
   - Maintain the research epic `RES-CORE` with child stories `RES-01` … `RES-10` (tags: `phase:research`, `cycle:[#]`, `discipline:lore/market`), and ensure each PBI is attached to the feature using `mcp__game-mcp-server__assign_backlog_to_feature`.  
   - At session start, pull the full story with `mcp__game-mcp-server__get_backlog_item`, move it to `in-progress` via `mcp__game-mcp-server__update_backlog_item`, and append acceptance criteria to reflect the tasks listed in the Session Grid.  
   - Record intermediate insights as checklist items or notes; link external sources in the backlog item.

3. **Execution & Knowledge Capture**  
   - Store structured outputs with `mcp__game-mcp-server__cache_research` (tags: `desert-adventure-online`, `phase:research`, `cycle:[#]`).  
   - Escalate any emerging architectural direction by drafting a candidate note and, once vetted in Session 10, persisting it with `mcp__game-mcp-server__store_architecture_decision` so the design phase inherits validated constraints.

4. **Closeout**  
   - Update the active backlog item to `done`, referencing cached research IDs and any draft architecture notes.  
   - Publish `docs/reports/autonomous-session-[N]-handoff.md` plus the matching MCP handoff via `mcp__game-mcp-server__store_handoff` that links to: backlog items touched, cached research entries, outstanding risks.

## Session Grid

| Session | Backlog Anchor | Research Focus | Required MCP Artifacts |
|---------|----------------|----------------|------------------------|
| 1–2 | `RES-01`, `RES-02` | Narrative & genre benchmarking (tone map, naming conventions, AI-driven narrative precedents). | Cached research entries for tone archetypes + naming lexicon; backlog notes summarizing comparable IPs; handoff excerpt referencing new datasets. |
| 3–4 | `RES-03`, `RES-04` | Gameplay and system comps (narrative RPG mechanics, success-check orchestration, autonomy tradeoffs). | Cached comparative matrix; backlog acceptance criteria checked off for mechanics viability; risks logged in handoff; notes on transparent background check runners. |
| 5–6 | `RES-05`, `RES-06` | Player experience & UX (chat-first web clients, memory-assisted prompts, long-session pacing cues). | Cached UI pattern library; backlog notes on engagement data; links to referenced products; findings on wrap-up signals and breakpoint surfacing. |
| 7–8 | `RES-07`, `RES-08` | Multiplayer world integration (offline post-session pipelines, moderation, persistence models). | Cached summaries of Story Consolidation → NER & Delta Determination workflows; backlog items include follow-up tasks for moderation frameworks; potential architecture decision drafts flagged. |
| 9 | `RES-09` | Technical landscape (LLM orchestration, background task infrastructure, persistence layers, cost analysis). | Cached vendor/stack comparison table; backlog record of tradeoffs; draft architecture notes tagged for Session 20 follow-up; cost estimates for the unified web client and offline pipeline. |
| 10 | `RES-10` | Full synthesis into Market Research Brief. | Cached final brief reference; backlog item marked complete with links to `MARKET_RESEARCH_SUMMARY.md`; handoff highlights unresolved questions for design phase and documents recommended pipeline cadence. |

## Output Requirements

Every session must deliver the following artefacts in addition to backlog updates:

1. **Goal Summary** — 2–3 sentences included in the handoff and backlog entry.  
2. **Sources & References** — Captured in the cached research payload and mirrored in `docs/research/` datasets as needed.  
3. **Findings** — Structured markdown (tables, bullet syntheses, datasets) stored locally and referenced in MCP records.  
4. **Implications for Design** — Actionable notes appended to the backlog item plus a short paragraph in the handoff.

## Phase Deliverables

- Maintain `docs/research/` with per-session artefacts that match the cached research IDs.  
- Compile `MARKET_RESEARCH_SUMMARY.md` during Session 10, referencing all relevant backlog items and cached research UUIDs.  
- Ensure any proto-architecture guidance discovered here is either confirmed or parked with explicit tags (`candidate-decision`, `needs-validation`) for the design phase to resolve.
