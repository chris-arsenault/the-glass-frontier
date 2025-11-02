# GAME_REQUIREMENTS.md

## 1. Product Summary

* **Working title**: The Glass Frontier
* **High concept**: Solo GPT-guided narrative runs feed a persistent multiplayer world. Outcomes distill into shared lore, news, hubs, and future prompts.
* **Primary UI**: Chat-first. Overlays for character sheet, map, inventory, quest log, faction standings, and news.
* **Setting**: Post‑apocalyptic sci‑fi with light fantasy and mystical elements (magitech, divinity). **Development Engine** must flesh out world name(s), regions, and a concise back‑history during the initial narrative phase.

## Backlog Governance

* Manage high-level initiatives as MCP **features**; each feature encapsulates the scope that spans multiple PBIs or sessions.
* Before opening new PBIs, confirm the correct feature exists via `mcp__game-mcp-server__list_features` or `mcp__game-mcp-server__list_feature_backlog_items`; create or update the feature with `mcp__game-mcp-server__create_feature` / `mcp__game-mcp-server__update_feature` as needed.
* Every PBI must be linked to its owning feature using `mcp__game-mcp-server__assign_backlog_to_feature`; backlog items without a feature are non-compliant with the delivery process.

## 2. Player Roles

* **Player**: Runs solo narrative sessions and visits social hubs.
* **GM Engine**: LLM-driven director that enforces rules, resolves checks, and proposes world updates.
* **Admin**: Curates world changes, reversals, and edits wiki/lore.

## 3. Core Loops

1. **Solo Story Loop**: Player intent → scene framing → turn-based chat → rules/stat checks → character updates → proposed world delta(s).
2. **World Distillation Loop**: Transcripts → extraction of candidate facts/events → dedupe/conflict handling → auto‑publish to world state on cadence → surface as lore + news.
3. **Hub Loop (MUD‑style)**: Players connect to hubs (rooms, exits, NPCs) → strict command verbs for actions → local chat, trades, quests → hub state impacts world.

## 4. World Model

* **Biomes**: More than desert but rare initially. Engine may expand distribution over time.
* **Entities**: Characters, NPCs, Factions, Locations, Items, Quests, Events, News.
* **Data duality**:

  * **Structured**: IDs, attributes, relations for logic and consistency.
  * **Unstructured**: Descriptions, lore, long‑form notes.
* **Canon rules**:

  * Internal logic consistency.
  * Anti power‑creep: enforce an admin‑editable **Prohibited Capabilities List** (seeded with “super‑powers”).
  * Time continuity and provenance.

## 5. Narrative System

* **Style**: Custom narrative‑rich system inspired by Monster of the Week.
* **Resolution**: Degrees of success, criticals, advantage. **Rule of cool**: advantage may be granted when the LLM judges a player’s input as sufficiently interesting.
* **To be finalized by Development Engine** during initial research phase:

  * Exact move/check taxonomy and mechanics.
  * Conditions, statuses, and harm model.
  * Tags and clocks/Fronts equivalent for threats and arcs.

## 6. Character System

* **Structured**: identity, attributes, skills/moves, health/stress, status effects, inventory (narrative‑first), faction reputation, milestones.
* **Unstructured**: biography, goals, narrative tags, relationships.
* **Inventory model**: narrative‑only items allowed; many items have presence without mechanics.
* **Checks**: engine calls a resolver (dice or clock) and applies modifiers from structured data.

## 7. Locations, Factions, NPCs

* **Locations**: id, type, biome, travel links, risk, resources; plus lore history and secrets.
* **Factions**: multi‑dimensional influence per region (e.g., military, economic, cultural). Exact dimensions to be set by Development Engine. **No decay** over time by default.
* **NPCs**: structured role/stats/schedules + unstructured personality and hooks. Engine may create new persistent NPCs and retire/kill existing ones.

## 8. Social Hubs (MUD‑style)

* **Scope**: Small initial playerbase. Performance targets modest.
* **Rooms**: name, desc, exits, occupancy caps, local channels.
* **Commands**: strict verb set (e.g., `say`, `whisper`, `look`, `move`, `emote`, `trade`, `use`, `quest`).
* **NPCs**: LLM‑driven chat personalities, but actions still gated by verbs.
* **PvP**: disabled.
* **Seeding**: Procedurally seed hubs at launch; additional hubs may emerge from story beats.

## 9. World State, Lore, and News

* **Storage**:

  * **Structured store**: normalized/graph entities and relations.
  * **Lore store**: versioned documents; public read via wiki.
* **Publishing cadence**: auto‑publish approved deltas on a configurable cadence (default TBD). Admin can revert anytime.
* **Conflict handling**: if two narrative beats oppose on the same cadence, trigger a **Crisis Point** that requires player resolution; publish as a time‑boxed event with hooks.
* **Surfacing**: convert published deltas into short news items tagged by region/faction/topic; show in client feed and on hub billboards.

## 10. Data Pipeline

* **Ingest**: store raw transcripts and tool calls per session.
* **Extraction**: identify candidate world facts/events with confidence scores.
* **Deconflict**: dedupe by entity/time/location; detect oppositions; spawn Crisis Points.
* **Governance**: single‑approver model for manual edits and reversals.
* **Retention**: transcripts/logs retained for 1 year.

## 11. Admin and Moderation

* **Capabilities**: approve/deny/revert deltas; edit entities and lore; maintain Prohibited Capabilities List; manage safety blocklists.
* **Audit**: full history with actor, timestamp, diffs, and provenance to session/character.
* **Revert SLA**: “whenever” with immediate effect when actioned.

## 12. UX and Access

* **Chat pane**: streaming messages with turn markers, check results, tool‑use badges.
* **Overlays**: character sheet, map, inventory, quest log, faction standings, news.
* **Wiki**: accessible on the web or in‑client; editing locked for anonymous users; read‑only for the public.
* **News tickers**: present in hubs and on the narrative start screen.

## 13. Multiplayer and Sessions

* **Sessions**: single‑player narratives with session id and rate limits; outcomes feed the world pipeline.
* **Presence**: hub rosters and local chat; private messages within hubs only.
* **Anti‑grief**: hub mute/report/throttle.

## 14. LLM/Model Policy

* **Model**: single model at start.
* **Determinism**: none required; seeds optional.
* **Guardrails**: apply content policy; enforce red lines and Prohibited Capabilities List.

## 15. Content Policy

* **Hard red lines**: rape, child abuse.
* **Permitted but moderated**: murder, slavery.
* **Power‑creep**: reject capabilities that break world logic; start Prohibited Capabilities List with “super‑powers”; admin‑editable.

## 16. Region and Ops Targets

* **Primary region**: us‑east‑1. Others TBD later.
* **Targets**: specific CCU, latency, and uptime goals may be set later by the Development Engine.

## 17. Tools/Function Interfaces (contract layer)

* `fetch_character(id)` → structured + unstructured view
* `update_character(patch)` → validated patch
* `fetch_location(id)` / `fetch_faction(id)` / `fetch_npc(id)`
* `roll_check(kind, dc | target, modifiers, advantage?)` → result {outcome, degree, notes}
* `propose_world_delta(payload)` → queued candidate with provenance
* `spawn_crisis_point(conflict_spec)` → crisis id, parameters, expiry
* `log_transcript(session_id, turn, content, tools_used)`

## 18. Acceptance Criteria (non‑implementation)

* **Story flow**: player completes a 6+ turn session; at least one check gates action; character updates persist; at least one candidate world delta generated with provenance.
* **Pipeline**: a transcript produces at least one published news item on cadence; conflict between two sessions yields a Crisis Point.
* **Admin**: admin can edit an entity, approve/revert a delta, and update Prohibited Capabilities List.
* **Hubs**: multiple players can chat, move rooms, trade with NPC, and see news billboards.
* **Wiki**: displays published lore; anonymous editing disabled.

## 19. Open/Delegated Items for Development Engine Research Phase

* Finalize world name(s), regions, and short back‑history.
* Solidify resolution mechanics: move taxonomy, degrees of success, criticals, advantage rules.
* Define faction influence dimensions and base values per key regions.
* Propose starting hubs, initial procedural seeding parameters, and first NPC rosters.
* Recommend initial publishing cadence values and Crisis Point defaults (duration, resolution hooks).
* Propose attribute/skill schema for characters and default item tag taxonomy.
