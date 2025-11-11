# NARRATIVE.md

## Phase Scope

Sessions 21–30 deliver the **worldbuilding and narrative foundation** for *The Glass Frontier*. Follow the operating loop in `AGENTS.md` while producing the Day‑0 world state: cosmology, history, geography, factions, technology, settlements, anomalies, and the consolidated world bible. Narrative work must leave an auditable trail across the MCP backlog, handoff ledger, and narrative knowledge stores.

Ground narrative decisions in the baseline expectations defined in `REQUIREMENTS.md` so major factions, themes, and systems evolve consistently with user-provided requirements, especially the design intent shift favoring freeform storytelling and its negative requirements.

## Design Intent Shift Narrative Focus

- Craft solo session materials that feel like a direct ChatGPT-style conversation between player and GM; surface hard memory context (character sheet, inventory, relationships, last-session recap, relevant lore) automatically without constraining intent.
- Embrace scene pacing that can stretch from moments to months and design narrative markers so sessions can run for hundreds of turns while still offering natural breakpoints the UI can highlight.
- Let the continuously updated shared world reflect narrative outcomes without hamstringing creative inputs—only constrain when safety, moderation, or anti power-creep policy applies. Durable deltas must be framed as post-session artefacts, not live-session canon.
- Treat story outputs as seeds for the offline post-session pipeline: prep transcript summaries, Story Consolidation hooks, and entity callouts that help NER & Delta Determination phases succeed.
- Treat conflict-resolution or crisis workflows as last-resort tools when narrative deltas truly collide; avoid centering them in core story beats.
- Keep open-ended natural language inputs available across narrative systems; only enforce strict verbs inside designated MUD hubs.
- Reinforce the Prohibited Capabilities List in every lore decision to prevent reality-breaking superpowers from entering canon.

## MCP-Integrated Session Workflow

1. **Continuity & Intake**
   - Load the latest handoff via `mcp__game-mcp-server__fetch_handoff` to inherit outstanding narrative tasks and references.
   - Surface active narrative PBIs with `mcp__game-mcp-server__get_top_backlog_items` (or `mcp__game-mcp-server__search_backlog_by_tag` using `phase:narrative` / `discipline:lore`). Search/list outputs now return partial data; hydrate any candidates with `mcp__game-mcp-server__get_backlog_item` before making updates.
   - Cross-check `REQUIREMENTS.md` for baseline lore, feature, and system constraints before outlining new narrative beats.
   - Review existing lore and story entries through `mcp__game-mcp-server__search_narrative_elements`, `mcp__game-mcp-server__search_lore`, and `mcp__game-mcp-server__find_dialogue` to avoid duplication and ensure continuity.

2. **Backlog & Feature Stewardship**
   - Maintain the narrative feature `NAR-CORE`; confirm or create it with `mcp__game-mcp-server__list_features` (features are returned in priority order but only as partial records—hydrate with `mcp__game-mcp-server__get_feature` before deciding on scope; only choose a new focus after finishing the current feature, following that ranking) / `mcp__game-mcp-server__create_feature`, and keep scope current via `mcp__game-mcp-server__update_feature`.
   - Track child stories `NAR-21` … `NAR-30`, tagged `phase:narrative`, `cycle:[#]`, `discipline:lore/narrative`. Use `mcp__game-mcp-server__assign_backlog_to_feature` to ensure each story is linked to `NAR-CORE`.
   - At session start, load the full backlog item via `mcp__game-mcp-server__get_backlog_item`, then move it to `in-progress` with `mcp__game-mcp-server__update_backlog_item`, aligning acceptance criteria with the Session Grid focus areas.
   - Record interim notes, checklists, and external references directly on the backlog item so downstream agents inherit context.

3. **Narrative Production & Capture**
   - Persist structured lore chapters with `mcp__game-mcp-server__store_narrative_element` (for beats, arcs, hooks) and `mcp__game-mcp-server__store_lore_entry` (for factions, regions, artifacts). Tag entries with session ID, cycle number, and associated backlog ID.
   - Store conversation seeds or ambient flavor lines via `mcp__game-mcp-server__store_dialogue_scene` when sessions generate dialogue artifacts.
   - Capture Story Consolidation-ready summaries and entity highlight lists alongside transcripts so the post-session pipeline can transform them into wiki stories and candidate deltas.
   - Before finalizing a major lore decision, run `mcp__game-mcp-server__check_consistency` to ensure harmony with existing architecture or narrative rulings.

4. **Session Closure**
   - Update the active backlog story to `done`, referencing the stored narrative/lore entry IDs and any outstanding risks or follow-ups.
   - Produce `docs/reports/autonomous-session-[N]-handoff.md` and mirror it with `mcp__game-mcp-server__store_handoff`, explicitly linking the backlog item, narrative entries, and pending tasks.
   - Sync `docs/plans/backlog.md` so local documentation reflects MCP truth.

## Session Grid

| Session | Backlog Anchor | Narrative Focus | Required MCP Artifacts |
|---------|----------------|-----------------|------------------------|
| 21–22 | `NAR-21`, `NAR-22` | Cosmology, metaphysics, and historical timeline of pre/post collapse. | Stored narrative elements for `COSMOLOGY.md` & `CHRONOLOGY.md`; lore entries for divine entities; backlog notes referencing consistency checks. |
| 23–24 | `NAR-23`, `NAR-24` | Geography, regions, and biomes including trade routes and hazards. | Lore entries per region (`REGIONS.md`), narrative elements mapping traversal hooks, and backlog attachments for ASCII/diagram assets. |
| 25–26 | `NAR-25`, `NAR-26` | Factions, governance, conflicts, and influence networks. | Lore entries tagged `faction`, narrative elements describing power arcs, dialogue scene concepts for faction voice samples, backlog notes tracking alliance matrices, Story Consolidation snippets capturing faction POV recaps. |
| 27 | `NAR-27` | Technology tiers, relic industry, and magitech tensions. | Narrative elements covering technology doctrines, lore entries for key facilities, cached consistency check references to design decisions, hooks for transparent momentum/success checks. |
| 28 | `NAR-28` | Major cities, settlements, and story beats anchored to locations. | Lore entries for each settlement, narrative elements outlining quest hooks, backlog links to map assets, NER-ready entity lists per location. |
| 29 | `NAR-29` | Unique phenomena, myths, and world anomalies. | Narrative elements for anomalies (`UNIQUE_PHENOMENA.md`), lore entries for legends, optional dialogue scenes for prophetic excerpts. |
| 30 | `NAR-30` | Consolidation into the Day‑0 World Bible. | Narrative element summarizing `WORLD_BIBLE.md`, backlog checklist confirming cross-links, handoff citing all referenced MCP IDs. |

## Narrative Production Standards

* Balance structured schema (tables, taxonomies, key-value traits) with evocative prose ready for procedural generation.
* Distinguish canon vs. legend explicitly; tag lore entries with `status:canon` or `status:legend` to keep ambiguity traceable.
* Reference how narrative assets interface with systems design—cite related architecture decisions or gameplay hooks inside narrative elements.
* Use consistent tagging (`cycle:[#]`, `phase:narrative`, region/faction identifiers) so search queries and downstream agents can retrieve material efficiently.
* Keep local files under `docs/lore/` and related directories synchronized with their MCP counterparts; when assets evolve, update both the markdown and the MCP record.

## Deliverables

Each session must produce the markdown artefacts listed in the Session Grid plus the following MCP-aligned outputs:

1. **Backlog Update** — Active `NAR-2X` story set to `done`, with notes pointing to stored narrative/lore/dialogue IDs and remaining questions.
2. **Narrative Knowledge Entries** — One or more calls to `mcp__game-mcp-server__store_narrative_element`, `mcp__game-mcp-server__store_lore_entry`, and (when applicable) `mcp__game-mcp-server__store_dialogue_scene`, all linked back to the session backlog ID.
3. **Handoff Package** — `docs/reports/autonomous-session-[N]-handoff.md` plus the mirrored MCP handoff containing: backlog references, narrative IDs, cross-discipline dependencies, and verification status.
4. **World Bible Integration** — Ensure every file (`COSMOLOGY.md`, `REGIONS.md`, etc.) references related entities and is prepped for inclusion in `WORLD_BIBLE.md` during Session 30, including Story Consolidation callouts and entity identifiers the post-session pipeline can ingest.
