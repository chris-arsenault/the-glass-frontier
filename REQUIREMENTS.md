# REQUIREMENTS.md

## 1. Product Summary

* **Working title**: The Glass Frontier
* **High concept**: Solo GPT-guided narrative runs feed a persistent multiplayer world. Outcomes distill into shared lore, news, hubs, and future prompts.
* **Primary UI**: Chat-first. Overlays for character sheet, map, inventory, quest log, faction standings, and news.
* **Setting**: Post‑apocalyptic sci‑fi with light fantasy and mystical elements (magitech, divinity). **Development Engine** must flesh out world name(s), regions, and a concise back‑history during the initial narrative phase.

## Backlog Governance

* Manage high-level initiatives as MCP **features**; each feature encapsulates scope spanning multiple PBIs or sessions.
* Before opening new PBIs, confirm the correct feature exists via `mcp__game-mcp-server__list_features` (features are returned in priority order; select a new feature only after completing the current one, following that ranking) or `mcp__game-mcp-server__list_feature_backlog_items`; create or update the feature with `mcp__game-mcp-server__create_feature` / `mcp__game-mcp-server__update_feature` as needed.
* Every PBI must be linked to its owning feature using `mcp__game-mcp-server__assign_backlog_to_feature`; backlog items without a feature are non‑compliant with the delivery process.

---

## 2. Design Intent Shift (Important)

* **Primary**: Cooperative GM‑style **freeform storytelling** via a direct ChatGPT‑like conversation between the GM Engine and the player. The player’s input is augmented with **hard memory context** (character sheet, inventory, traits, relationships, last‑session summary, relevant location/faction facts) to inform interpretation—not to coerce actions.
* **Secondary**: A **continuously updated world** that surfaces distilled outcomes as lore and news. **Narrative co‑authorship outweighs state→action→update patterns** during live play.
* **World deltas**: Generated **only after a session completes**, through an offline pipeline. Live sessions should not emit persistent world changes except ephemeral notes.
* **Conflict deconfliction**: Rare. Only invoked when overlapping world edits are materially incompatible.

### Negative Requirements

* Do **not** design the solo narrative as a text action game or intent parser that forces discrete command verbs.
* Do **not** center live play around state→action→update mechanics; treat them as backstage, post‑session processes.
* Do **not** prioritize crisis resolution systems or conflicting‑edit workflows as core gameplay. They are **edge cases**.
* Do **not** block creative player inputs behind enumerated actions, outside of MUD hubs.
* Do **not** introduce open‑ended superpowers or reality‑breaking abilities; maintain the **Prohibited Capabilities List**.
* Do **not** add Elasticsearch or other managed search stacks during bootstrap; prefer **self‑hosted** options.

---

## 3. Player Roles

* **Player**: Runs solo narrative sessions and visits social hubs.
* **GM Engine**: LLM director that frames scenes, adjudicates checks, applies rules, and proposes world updates while preserving narrative freedom.
* **Admin**: Curates world changes, reversals, and edits wiki/lore.

---

## 4. Core Loops

1. **Solo Story Loop**: Player intent (freeform NL) ↔ GM framing and consequence → optional checks → ephemeral notes to session context. **No persistent world writes during the session.**
2. **Post‑Session Publishing Loop**: Raw transcript → **Story Consolidation** (produce a public‑facing session write‑up for the wiki) → **Named Entity Resolution & Delta Determination** (extract entities, propose deltas) → light deconflict → **auto‑publish on cadence** with admin override.
3. **Hub Loop (MUD‑style)**: Players connect to hubs (rooms, exits, NPCs) → **strict command verbs only here** → local chat, trades, quests → hub state impacts world via the same **post‑session** pipeline for durable changes.

---

## 5. World Model

* **Biomes**: More than desert but rare initially. Engine may expand distribution over time.
* **Entities**: Characters, NPCs, Factions, Locations, Items, Quests, Events, News.
* **Data duality**:

  * **Structured**: IDs, attributes, relations for logic and consistency.
  * **Unstructured**: Descriptions, lore, long‑form notes.
* **Canon rules**:

  * Internal logic consistency.
  * Anti power‑creep: enforce an admin‑editable **Prohibited Capabilities List** (seeded with “super‑powers”).
  * Time continuity and provenance.

---

## 6. Narrative System

* **Style**: Custom narrative‑rich system inspired by Monster of the Week.
* **Resolution**: Degrees of success, criticals, advantage. **Rule of cool**: advantage may be granted when the LLM judges a player’s input as sufficiently interesting.
* **Momentum/Success Checks**: All checks occur **transparently**. A dedicated background task evaluates user input, determines whether a roll or success check is needed, executes it, and forwards both the user input and check outcome to the **primary narrative engine**. The narrative engine then integrates that result naturally into the story response.
* **Interaction model**: Freeform NL. The engine **suggests** moves/checks; it **does not require** mapping inputs to a finite verb set. Moves are advisory scaffolds, not constraints.
* **To be finalized by the Development Engine** during research:

  * Move/check taxonomy and mechanics.
  * Conditions, statuses, and harm model.
  * Tags and clocks/Fronts analogs for threats and arcs.

---

## 7. Character System

* **Structured**: identity, attributes, skills/moves, health/stress, status effects, inventory (narrative‑first), faction reputation, milestones.
* **Unstructured**: biography, goals, narrative tags, relationships.
* **Inventory model**: narrative‑only items allowed; many items have presence without mechanics.
* **Checks**: resolver applies modifiers from structured data; deterministic rolls are optional.

---

## 8. Locations, Factions, NPCs

* **Locations**: id, type, biome, travel links, risk, resources; plus lore history and secrets.
* **Factions**: multi‑dimensional influence per region (e.g., military, economic, cultural). Exact dimensions to be set by the Development Engine. **No decay** over time by default.
* **NPCs**: structured role/stats/schedules + unstructured personality and hooks. Engine may create new persistent NPCs and retire/kill existing ones.

---

## 9. Social Hubs (MUD‑style)

* **Scope**: Small initial playerbase. Performance targets modest.
* **Rooms**: name, desc, exits, occupancy caps, local channels.
* **Commands**: **strict verb set** (e.g., `say`, `whisper`, `look`, `move`, `emote`, `trade`, `use`, `quest`).
* **NPCs**: LLM‑driven chat personalities; actions still gated by verbs.
* **PvP**: disabled.
* **Seeding**: Procedurally seed hubs at launch; additional hubs may emerge from story beats.

---

## 10. World State, Lore, and News

* **Storage**:

  * **Structured store**: normalized/graph entities and relations.
  * **Lore store**: versioned documents; public read via wiki.
* **Publishing cadence**: world deltas and lore updates are produced **after sessions** by the pipeline and published on a configurable cadence (default TBD). Admin can revert anytime.
* **Conflict handling**: **lightweight**. Only escalate to **Crisis Points** when two publish‑ready edits are materially incompatible and impactful; otherwise prefer soft merges.
* **Surfacing**: convert published deltas into short news items tagged by region/faction/topic; show in client feed and on hub billboards.

---

## 11. Data Pipeline

* **Phase A — Ingest**: capture raw transcripts and tool calls per session; store immutable logs.
* **Phase B — Story Consolidation**: transform transcript into a concise, readable **public story** for the wiki with provenance and tags.
* **Phase C — NER & Delta Determination**: perform named‑entity resolution, extract candidate world facts/events with confidence; map to structured entities.
* **Phase D — Deconflict & Governance**: dedupe by entity/time/location; detect rare oppositions; spawn Crisis Points **only when justified**; apply single‑approver review if needed.
* **Phase E — Publish**: batch publish lore + deltas on cadence; emit news items and hooks.
* **Retention**: transcripts/logs retained for 1 year.

---

## 12. Admin and Moderation

* **Capabilities**: approve/deny/revert deltas; edit entities and lore; maintain Prohibited Capabilities List; manage safety blocklists.
* **Audit**: full history with actor, timestamp, diffs, and provenance to session/character.
* **Revert SLA**: “whenever” with immediate effect when actioned.

---

## 13. UX and Access

* **Web-based Interface Requirement**: A fully functional **web-based UI** providing chat interaction, character management, map and lore integration, and account handling is a **primary critical deliverable**. This interface must unify gameplay, narrative interaction, and administrative functions, serving as the central access point for players and administrators.
* **Chat pane**: streaming messages with turn markers, check results, tool‑use badges.
* **Overlays**: character sheet, map, inventory, quest log, faction standings, news.
* **Wiki**: accessible on the web or in‑client; editing locked for anonymous users; read‑only for the public.
* **News tickers**: present in hubs and on the narrative start screen.

---

## 14. Multiplayer and Sessions

* **Sessions**: single‑player narratives with session id and rate limits; outcomes feed the world pipeline. Sessions may be **long**, extending into **hundreds of turns**; the system must support persistence and continuity over extended interactions.
* **UI Interaction**: the interface should indicate **narrative breakpoints** for natural story conclusions and allow players to signal that a session is **nearing completion**, prompting the GM to wrap up in **1–3 turns**.
* **Presence**: hub rosters and local chat; private messages within hubs only.
* **Anti‑grief**: hub mute/report/throttle.

---

## 15. LLM/Model Policy

* **Model**: single model at start.
* **Determinism**: none required; seeds optional.
* **Guardrails**: apply content policy; enforce red lines and Prohibited Capabilities List.

---

## 16. Region, Ops, and Cost Targets

* **Primary region**: us‑east‑1 for cloud‑controlled expansion; bootstrap deployments may run in an equivalent self‑hosted facility.
* **Initial load profile**: support ~5 users operating sequentially; concurrent sessions not required.
* **Cost envelope**: **< $100/month** target during bootstrap.
* **Infra preferences**: prefer **self‑hosted** data stores and services; e.g., Qdrant for vector search, PostgreSQL for relational, object storage on low‑cost tier. Avoid Elasticsearch/managed search.
* **Targets**: CCU/latency/uptime can be set later by the Development Engine.

---

## 17. Tools/Function Interfaces (contract layer)

This section is intentionally reserved for the **Design Engine**. During the design phase, the engine must:

* Identify which system interfaces and tool functions are necessary to support the narrative engine, world pipeline, and administrative workflows.
* Define parameters, expected input/output schemas, and their relationships to internal systems (character, world, faction, hub, and narrative services).
* Propose clear interface contracts between core subsystems and external components (e.g., MCP, storage, or LLM integration layers).

The current list of function stubs will be replaced with finalized specifications once the Design Engine produces a complete integration map.

---

## 18. Acceptance Criteria (non‑implementation)

* **Story flow**: player completes a 6+ turn session; at least one check gates action; character updates persist **only as session notes** during play; no persistent world writes occur mid‑session.
* **Pipeline**: the completed session produces (a) a consolidated **wiki story** with tags and provenance, and (b) at least one candidate world delta from NER/Delta Determination. **Conflict handling remains unused in most test runs**, but when synthetic conflict is injected, it yields a Crisis Point.
* **Admin**: admin can edit an entity, approve/revert a delta, and update Prohibited Capabilities List.
* **Hubs**: multiple players can chat, move rooms, trade with NPC, and see news billboards.
* **Wiki**: displays published lore; anonymous editing disabled.

---

## 19. Open/Delegated Items for Development Engine Research Phase

* Finalize world name(s), regions, and short back‑history.
* Solidify resolution mechanics: move taxonomy, degrees of success, criticals, advantage rules consistent with freeform inputs.
* Define faction influence dimensions and base values per key regions.
* Propose starting hubs, initial procedural seeding parameters, and first NPC rosters.
* Recommend initial publishing cadence values and low‑touch conflict thresholds.
* Propose attribute/skill schema for characters and default item tag taxonomy.
