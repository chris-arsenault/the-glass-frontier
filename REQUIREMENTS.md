# REQUIREMENTS.md

## 1. Product Summary

* **Working title**: The Glass Frontier
* **High concept**: Solo GPT-guided narrative runs feed a persistent multiplayer world. Outcomes distill into shared lore, news, hubs, and future prompts.
* **Primary UI**: Chat-first. Overlays for character sheet, map, inventory, quest log, faction standings, and news.
* **Setting**: Post‑apocalyptic sci‑fi with light fantasy and mystical elements (magitech, divinity). **Development Engine** must flesh out world name(s), regions, and a concise back‑history during the initial narrative phase.

## Backlog Governance

* Manage high-level initiatives as MCP **features**; each feature encapsulates scope spanning multiple PBIs or sessions.
* Before opening new PBIs, confirm the correct feature exists via `mcp__game-mcp-server__list_features` or `mcp__game-mcp-server__list_feature_backlog_items`; create or update the feature with `mcp__game-mcp-server__create_feature` / `mcp__game-mcp-server__update_feature` as needed.
* Every PBI must be linked to its owning feature using `mcp__game-mcp-server__assign_backlog_to_feature`; backlog items without a feature are non‑compliant with the delivery process.

---

## 2. Design Intent Shift (Important)

* **Primary**: Cooperative GM‑style **freeform storytelling** in single‑player sessions. Narrative breadth over strict action parsing. Story beats may span minutes to months (e.g., infiltration, legislation, town‑building).
* **Secondary**: A **continuously updated world** that surfaces distilled outcomes as lore and news. World consistency matters, but **narrative freedom takes precedence** within safety and anti‑power‑creep constraints.
* **Conflict deconfliction**: Rare. Only invoked when overlapping world edits are materially incompatible.

### Negative Requirements

* Do **not** design the solo narrative as a text action game or intent parser that forces discrete command verbs.
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

1. **Solo Story Loop**: Player intent (freeform NL) → scene framing → turn‑based chat → rules/stat checks as needed → character updates → proposed world delta(s).
2. **World Distillation Loop**: Transcripts → extract candidate facts/events → dedupe/light conflict handling → **auto‑publish** to world state on cadence → surface as lore + news.
3. **Hub Loop (MUD‑style)**: Players connect to hubs (rooms, exits, NPCs) → **strict command verbs only here** → local chat, trades, quests → hub state impacts world.

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
* **Publishing cadence**: auto‑publish approved deltas on a configurable cadence (default TBD). Admin can revert anytime.
* **Conflict handling**: **lightweight**. Only escalate to **Crisis Points** when two published‑ready edits are materially incompatible and impactful; otherwise prefer soft merges.
* **Surfacing**: convert published deltas into short news items tagged by region/faction/topic; show in client feed and on hub billboards.

---

## 11. Data Pipeline

* **Ingest**: store raw transcripts and tool calls per session.
* **Extraction**: identify candidate world facts/events with confidence scores.
* **Deconflict**: dedupe by entity/time/location; detect rare oppositions; spawn Crisis Points **only when justified**.
* **Governance**: single‑approver model for manual edits and reversals.
* **Retention**: transcripts/logs retained for 1 year.

---

## 12. Admin and Moderation

* **Capabilities**: approve/deny/revert deltas; edit entities and lore; maintain Prohibited Capabilities List; manage safety blocklists.
* **Audit**: full history with actor, timestamp, diffs, and provenance to session/character.
* **Revert SLA**: “whenever” with immediate effect when actioned.

---

## 13. UX and Access

* **Chat pane**: streaming messages with turn markers, check results, tool‑use badges.
* **Overlays**: character sheet, map, inventory, quest log, faction standings, news.
* **Wiki**: accessible on the web or in‑client; editing locked for anonymous users; read‑only for the public.
* **News tickers**: present in hubs and on the narrative start screen.

---

## 14. Multiplayer and Sessions

* **Sessions**: single‑player narratives with session id and rate limits; outcomes feed the world pipeline.
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

* `fetch_character(id)` → structured + unstructured view
* `update_character(patch)` → validated patch
* `fetch_location(id)` / `fetch_faction(id)` / `fetch_npc(id)`
* `roll_check(kind, dc | target, modifiers, advantage?)` → result {outcome, degree, notes}
* `propose_world_delta(payload)` → queued candidate with provenance
* `spawn_crisis_point(conflict_spec)` → crisis id, parameters, expiry (rare path)
* `log_transcript(session_id, turn, content, tools_used)`

---

## 18. Acceptance Criteria (non‑implementation)

* **Story flow**: player completes a 6+ turn session; at least one check gates action; character updates persist; at least one candidate world delta generated with provenance.
* **Pipeline**: a transcript produces at least one published news item on cadence; **conflict handling remains unused in most test runs**, but when synthetic conflict is injected, it yields a Crisis Point.
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
