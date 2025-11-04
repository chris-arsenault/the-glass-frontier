<!-- AGENTS.md -->
# Codex Single-Agent Manual

## Single-Agent Operating Loop (Mandatory)
1. **Load the latest handoff immediately.** Call `mcp__game-mcp-server__fetch_handoff` before planning anything. If no handoff exists, bootstrap the project (Phase 0).
2. **Parse and plan.** Extract TODOs, risks, and asset needs from the handoff, then refresh the Codex plan tool so every active task is tracked while cross-referencing `REQUIREMENTS.md` to keep plans aligned with baseline feature and technical commitments.
3. **Review Git context.** Run `git diff --stat` to understand prior work before starting execution.
4. **Align with the backlog.** Inspect current priorities in the MCP backlog, confirm WIP capacity, and pull the highest-impact story—ensure the target item already belongs to a feature or assign it before continuing. Use search/list calls to gather candidate IDs (they now return partial records), then hydrate backlog entries with `mcp__game-mcp-server__get_backlog_item`. When you need information about a related feature, look it up separately with `mcp__game-mcp-server__get_feature` after identifying the feature ID. Never skip the top-priority item because it is large; instead, plan the work and begin execution on core features immediately.
5. **Execute and log decisions.** Implement the work item end-to-end, capturing architecture changes with `mcp__game-mcp-server__store_architecture_decision` (query/check with `mcp__game-mcp-server__query_architecture` and `mcp__game-mcp-server__check_consistency`, then pull complete context via `mcp__game-mcp-server__get_architecture_decision`) and updating narrative outcomes through `mcp__game-mcp-server__store_narrative_element`, `mcp__game-mcp-server__store_lore_entry`, or `mcp__game-mcp-server__store_dialogue_scene` as appropriate.
6. **Verify and document.** Run automated tests (Jest, Playwright, profiling) and note results. Update docs, backlog items, and session notes with links to the stored MCP entries.
7. **Publish the next handoff.** Create `docs/reports/autonomous-session-[N]-handoff.md`, then persist the same content with `mcp__game-mcp-server__store_handoff` (`content`, `updated_by`, `tags`). Do not exit the session until both are complete.

**Non-negotiable:** Handoff fetch and store bookend every autonomous run. Skipping either step breaks continuity.

## Backlog & Planning Discipline
1. **Discover:** Query the MCP backlog (`mcp__game-mcp-server__search_backlog_semantic`, `mcp__game-mcp-server__search_backlog_by_tag`, `mcp__game-mcp-server__get_top_backlog_items`) before starting work to avoid duplication and to lock onto current priorities. These search/list calls now emit partial records—follow up with `mcp__game-mcp-server__get_backlog_item` to review the complete details for each candidate.
2. **Enforce WIP ≤ 10:** Keep at most ten items in `in-progress`, `blocked`, or `ready-for-review`. Escalate conflicts instead of overcommitting.
3. **Commit to priority scope:** Always start the highest-priority backlog item even when it is large or complex. Break the work into executable plan steps or supporting backlog items, but do not defer core feature delivery to avoid overcommitment.
4. **Create intentionally:** Only open new backlog items when the work is critical to the shipping roadmap. Include summary, acceptance criteria, dependencies, priority, sprint, aligned tags, and attach the item to the owning feature.
5. **Structure with features:** Treat features as the parent container for initiatives spanning multiple PBIs. After design, research, and narrative phases wrap, carve the implementation backlog into multiple high-level features aligned to major systems or pillars—never collapse all implementation work into a single catch-all feature. Before creating new work, confirm whether an existing feature applies (`mcp__game-mcp-server__list_features`, which returns features in priority order but only partial records—hydrate each target with `mcp__game-mcp-server__get_feature`; `mcp__game-mcp-server__list_feature_backlog_items`, then `mcp__game-mcp-server__get_backlog_item`) or establish a new one (`mcp__game-mcp-server__create_feature`, `mcp__game-mcp-server__update_feature`). Link each backlog item using `mcp__game-mcp-server__assign_backlog_to_feature`.
6. **Update relentlessly:** Use `mcp__game-mcp-server__update_backlog_item` to track status, next steps, completed work, and references to architecture or narrative entries.
7. **Close fast:** Mark stories done as soon as acceptance criteria pass; do not extend scope within the same item.
8. **Synchronize records:** After adjusting MCP items, refresh `docs/plans/backlog.md` so markdown mirrors the authoritative backlog.

**Non-negotiable:** Every change and new work item must be reflected in the MCP backlog, and every backlog item must belong to a feature. Stay focused on core systems—no speculative tooling or analytics. Advance core, high-priority features regardless of size; the WIP limit guides focus, not avoidance.

## Workflow Standards
- Maintain an up-to-date plan whenever a task spans multiple steps.
- Stay on the highest-priority backlog commitments; accept deep work over task-churn.
- Run shell commands with `bash -lc` and an explicit `workdir`, capturing outputs that drive decisions.
- Favor `apply_patch` (or heredocs for new files) over describing intent without implementation.
- Summarize automated verification (tests, lint, Playwright, profiling) plus follow-ups in the final response.
- Restrict edits to active scope; ignore unrelated files unless the user directs otherwise.
- Treat MCP integrations as first-class: query before authoring, store results immediately, and tag entries for discoverability.
- Mirror MCP decisions in local docs only after the MCP source is updated.
- Rely exclusively on automated QA—no manual sweeps.

### Command & Editing Practices
- Keep edits ASCII unless a file already uses another encoding.
- Avoid destructive git commands (`git reset --hard`, `git checkout --`) unless explicitly instructed.
- Use repository tooling (npm scripts, Jest, Playwright) when validating work.

### Asset Sourcing Policy
- Generate required art/audio via `mcp__generate-image__generate_image`, specifying `background` and absolute `file_location`.
- Record asset metadata, usage, and automation details in session notes or relevant docs.

### Verification & Reporting
- Run `npm test` after meaningful implementation changes; add focused suites (Playwright, profiling) when relevant.
- If a verification step cannot run, log the gap with a plan to validate once unblocked.

## MCP Tooling for the Single Agent
- **Backlog & Handoff:** `mcp__game-mcp-server__fetch_handoff`, `mcp__game-mcp-server__store_handoff`, `mcp__game-mcp-server__search_backlog_semantic`, `mcp__game-mcp-server__search_backlog_by_tag`, `mcp__game-mcp-server__get_top_backlog_items`, `mcp__game-mcp-server__create_backlog_item`, `mcp__game-mcp-server__update_backlog_item`, `mcp__game-mcp-server__list_features` (returns features in priority order but only partial records—hydrate targets with `mcp__game-mcp-server__get_feature` before editing), `mcp__game-mcp-server__list_feature_backlog_items` (pair each ID with `mcp__game-mcp-server__get_backlog_item`), `mcp__game-mcp-server__create_feature`, `mcp__game-mcp-server__update_feature`, `mcp__game-mcp-server__assign_backlog_to_feature`.
- **Architecture Knowledge:** `mcp__game-mcp-server__query_architecture` (returns partial records—use `mcp__game-mcp-server__get_architecture_decision` for full context), `mcp__game-mcp-server__check_consistency`, `mcp__game-mcp-server__store_architecture_decision`.
- **Narrative Knowledge:** `mcp__game-mcp-server__store_narrative_element`, `mcp__game-mcp-server__search_narrative_elements`, `mcp__game-mcp-server__get_narrative_outline`, `mcp__game-mcp-server__store_lore_entry`, `mcp__game-mcp-server__search_lore`, `mcp__game-mcp-server__store_dialogue_scene`, `mcp__game-mcp-server__find_dialogue`.
- **Development Patterns & QA:** `mcp__game-mcp-server__store_pattern`, `mcp__game-mcp-server__find_similar_patterns`, `mcp__game-mcp-server__validate_against_patterns`, `mcp__game-mcp-server__record_playtest_feedback`, `mcp__game-mcp-server__store_test_strategy`.

### Core MCP Principles
1. Query before creating new content.
2. Store results as soon as work completes.
3. Apply rich tagging for discoverability and link related entries.
4. Validate designs and implementations against stored patterns and decisions.

### Benefits
- Eliminates redundant effort across sessions.
- Maintains consistency in code, narrative, and lore.
- Preserves cumulative project knowledge.
- Enables cross-discipline coordination through shared references.
- Accelerates development by reusing proven solutions.

## Project Context
### Overview
Medium-complexity 2D action-adventure built with vanilla JavaScript and Canvas. The experience blends at least two genres, uses procedural generation, and delivers a cohesive narrative with consequential player choices.

Always consult `REQUIREMENTS.md` for the authoritative list of user-provided requirements that guide these systems; treat that document as the baseline scope for research, design, narrative, and implementation decisions.

### Design Intent Shift Alignment
- Center every decision on cooperative GM-style **freeform storytelling** during solo sessions; narrative breadth outweighs mechanical parsing, and story beats may span minutes to months.
- Treat the continuously updated shared world as secondary; maintain world consistency without constraining player creativity unless safety or anti-power-creep rules are at risk, and let narrative freedom take precedence when trade-offs arise.
- Restrict conflict-resolution workflows to exceptional cases when world edits are materially incompatible.
- Reject text-action parsers or rigid verb lists outside of MUD hubs; keep creative inputs open-ended elsewhere.
- Uphold the Prohibited Capabilities List—no reality-breaking or open-ended superpowers.
- Favor self-hosted search solutions; do not introduce managed stacks such as Elasticsearch during bootstrap.

### Technology Stack
- **Engine:** Vanilla JavaScript (ES6+) / React
- **Rendering:** HTML5 Canvas API
- **Build:** Vite
- **Testing:** Jest + Playwright
- **Linting & Formatting:** ESLint + Prettier

## Development Cadence
- Rotate through research, planning, implementation, testing, optimization, and documentation within each session.
- Keep narrative implications visible in every system you touch; seed plot hooks and consequence tracking during implementation.
- Maintain automated test coverage alongside features; expand Playwright or profiling runs when gameplay breadth or performance shifts.
- Treat performance tuning as an ongoing activity—profile when systems affect frame time, AI density, or narrative state machines.
- Capture architectural decisions and narrative updates in MCP as soon as they occur to keep historical context fresh.

### Continuous Practices
- Keep `docs/plans/backlog.md` prioritized and prune completed entries promptly.
- Trigger Playwright (`mcp__playwright__browser_*`) when UI or end-to-end validation is required.
- Treat MCP outages as blockers: log the downtime, proceed with local inspection, and note the gap in the handoff.
- **Important:** Do not work on CI, independent verification pipelines, or reporting features.

### Completion Checklist
Before ending a session ensure:
- Handoff file and MCP entry are updated with summary, metrics, outstanding work, asset sourcing actions, and blockers.
- Tests relevant to the change set are green (or pending with rationale).
- Documentation and backlog mirror the latest state.
- Media sourcing notes capture every automation run and resulting assets.

## Standards
### Code
- camelCase for functions/variables, PascalCase for classes.
- Max 300 lines per file, 50 lines per function; keep single responsibility.
- JSDoc all public APIs and note narrative/world hooks where applicable.
- Use conventional commits with test results in the body and narrative/genre impact notes for feature work.

### Performance
- Use object pooling for frequently instantiated objects.
- Avoid per-frame allocations; stream content and narrative state lazily.
- Ensure branching quests and world updates remain performant under stress.
