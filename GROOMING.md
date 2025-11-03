                                              # GROOMING.md

## Objective

Guide the development agent during **grooming cycles**—executed after the RESEARCH, DESIGN, and NARRATIVE phases, and once every subsequent 10 sessions—to maintain alignment, backlog hygiene, and clear direction for the next phase of development.

The goal of each grooming cycle is to:

1. Audit and update all tracked features and backlog items.
2. Close completed items aggressively.
3. Prioritize upcoming work focused on **gameplay implementation**, the offline **post-session publishing pipeline**, and the unified web client demanded by `REQUIREMENTS.md`.
4. Defer non‑critical concerns (performance, CI, ops) until core gameplay is functional.

---

## Scope

These instructions apply whenever a grooming session is triggered:

* **After Session 30** (end of NARRATIVE phase).
* **Every 10th session thereafter**.

Each grooming session operates over MCP tooling and internal data from prior sessions.

---

## Grooming Steps

### 1. Synchronize Features and Backlog

* Query all existing features via:

  * `mcp__game-mcp-server__list_features` (returns features in priority order so the next focus, once the current feature is finished, should follow that queue)
  * `mcp__game-mcp-server__list_feature_backlog_items`
* Identify any features missing backlog links.
* For each uncovered area of work (new system, design, or narrative topic), create new **features** using:

  * `mcp__game-mcp-server__create_feature`
* For all untracked PBIs (stories, tasks, research notes), assign them to the correct feature:

  * `mcp__game-mcp-server__assign_backlog_to_feature`

### 2. Update Existing Backlog Items

* Review all open PBIs. For each:

  * Verify description accuracy and current status.
  * Update or refine with `mcp__game-mcp-server__update_feature` if the feature scope or summary has evolved.
  * Add missing metadata (priority, owner, dependency chain).

### 3. Aggressively Close Completed Work

* Close PBIs or features that:

  * Are fully implemented or incorporated into the live design.
  * Have documentation output in RESEARCH, DESIGN, or NARRATIVE phases.
  * Have been superseded or rendered obsolete.
* Remove duplicate or redundant backlog entries.

### 4. Prioritization for Next Cycle

* Produce a **Prioritized Work Plan** for the next 10 sessions:

  * **Tier 1: Gameplay implementation** — chat-first GM engine with hard memory context, transparent background success-check runner, offline post-session pipeline (Story Consolidation → NER & Delta Determination → publishing), and core hub loops.
  * **Tier 1a: Web Client** — fully featured web interface unifying chat, overlays, account handling, and admin controls.
  * **Tier 2: Secondary systems** — admin tools, world news surfacing, faction influence visualization, hub NPC interactions.
  * **Tier 3: Deferred items** — performance optimization, CI/CD automation, observability, and scaling improvements.
* Output this plan as a ranked table with priorities (`P1` through `P3`).

### 5. Validation and Sanity Checks

* Confirm all gameplay implementation priorities link back to features in `REQUIREMENTS.md`, especially the mandates for offline world updates and the unified web client.
* Ensure each feature has at least one backlog item tied to an executable deliverable (code, config, narrative seed, or data schema) and that no workplans assume live-session world writes.
* Check that no backlog items remain orphaned.

### 6. Output

Each grooming session must produce:

1. `docs/BACKLOG_AUDIT.md` — listing all open features, linked PBIs, and their current status.
2. `docs/NEXT_SPRINT_PLAN.md` — prioritized list of tasks and focus areas for the next 10 sessions.
3. Inline MCP updates via the `mcp__game-mcp-server__update_feature` and related APIs.

---

## Principles

* Prioritize *player‑visible progress* first.
* Avoid over‑engineering; focus on the smallest coherent playable loop.
* Keep backlog lean: prefer deletion or consolidation over duplication.
* Performance, infrastructure, and CI/CD tasks should **not** appear before playable core systems exist.
* Narrative richness and player experience are success criteria for the next cycles.

---

## Deliverable Summary

Each Grooming phase produces and enforces:

* Up‑to‑date feature list with linked backlog items.
* Closed/completed tasks removed from active queues.
* Prioritized action plan focused on gameplay implementation.
* Clear traceability between gameplay systems and their originating design features.
