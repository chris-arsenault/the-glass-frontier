# DES-11 – Global Systems Map

Backlog anchor: `DES-11`, Feature: `DES-CORE`

## Purpose
Translate the research corpus and `REQUIREMENTS.md` mandates into a cross-system blueprint that frames how the Narrative Engine, Character System, offline Post-Session pipeline, Lore/Wiki, Hub System, and unified Web UI shell collaborate to deliver The Glass Frontier’s freeform GM experience.

## Design Principles
- Preserve freeform player agency by keeping all success checks and rules adjudication transparent yet unobtrusive.
- Delay durable world mutations to the offline publishing pipeline; live sessions only record ephemeral notes.
- Maintain tone and naming coherence by embedding research artefacts (tone bible, naming lexicons) inside the GM memory stack.
- Target self-hosted, cost-aware infrastructure (LangGraph + Temporal + CouchDB/PostgreSQL + Meilisearch/pg_trgm).
- Ensure every surface (chat, hubs, admin) feeds provenance-rich telemetry for audits and post-session synthesis.

## System Landscape Overview
```
+-------------------+       +----------------------+       +---------------------+
|  Unified Web UI   | <---> |  Narrative Engine    | <---> |   Check Runner      |
|  (Chat, Sheets,   |       |  (LangGraph Orches.)|       |   (Temporal Workflows)
|  Map, Admin)      |       +----------+-----------+       +----------+----------+
|  Service Worker   |                  |                              |
|  Offline Cache    |                  v                              v
+---------+---------+        +--------+---------+           +---------+---------+
          |                  |  Session Memory  |           | Telemetry & Audit |
          |                  |  (Profiles, Tone |           |  Streams (Event   |
          |                  |   Bible, Notes)  |           |  Sourcing + Kafka)|
          v                  +------+-----------+           +---------+---------+
+---------+---------+               |                                      |
| Hub System (MUD) |               v                                      v
| Command Router   |        +------+-----------+           +-------------+--------------+
| Room Topologies  |------> | Offline Post-    |  ----->   | Lore/Wiki Publishing Stack |
+------------------+        | Session Pipeline |           | (Story Consolidation, NER,  |
                             |  (Temporal +     |           |  Delta Determination,      |
                             |   Workers)       |           |  Moderation Console)       |
                             +------------------+           +---------------------------+
```

## Key Components

### Narrative Engine (LangGraph Orchestrator)
- **Responsibilities:** Scene framing, intent interpretation, success check requests, tone adherence, pacing markers.
- **Inputs:** Player chat messages (with context), character sheet data, session memory shards, hub events, admin nudges.
- **Outputs:** GM responses, check prompts, ephemeral session notes, structured telemetry events.
- **Internal Modules:**
  - Prompt stack seeded with tone bible, naming lexicon, world lore.
  - Memory manager referencing Character System APIs for sheets/inventory/relationships.
  - Check invocation bus pushing intents to Temporal-driven Check Runner.
- **Risks:** Prompt bloat impacting latency; requires guardrails on memory size and caching of lore snippets.

### Character System
- **Responsibilities:** Manage player character sheets, inventories, traits, relationships, advancement tracks.
- **Interfaces:**
  - CRUD API consumed by Narrative Engine, Web UI overlays, and offline pipelines.
  - Event stream for sheet mutations captured as ephemeral session notes then reconciled offline.
- **Data Model:** Hybrid (structured stats + narrative tags); maintains prohibited capability list references to block disallowed abilities.
- **Risks:** Ensuring offline reconciliation aligns with player expectations; needs conflict detection when multiple sessions mutate the same character sequentially.

### Check Runner & Telemetry
- **Responsibilities:** Evaluate when actions require rolls, execute probabilistic resolution, emit transparent results with rationale.
- **Implementation:** Temporal workflows triggered via LangGraph nodes; stores replay logs for audits.
- **Telemetry:** Streams structured events (roll type, modifiers, success tier) into event-sourced store for analytics and fairness review.
- **Risks:** Must stay invisible during smooth play; latency spikes break immersion—requires lightweight queueing and optimistic narration hooks.

### Unified Web UI Shell
- **Modules:**
  - Chat canvas with conversation threading, pacing markers, “wrap in 1–3 turns” controls.
  - Overlays for character sheet, inventory, map, lore/news feed, faction standings, admin consoles.
  - Service worker-backed offline cache for transcripts and assets; background sync for pending notes.
- **Integration:** Consumes Narrative Engine responses, check outcomes, and hub updates via WebSocket/EventSource; pushes player intents, admin actions, and hub commands.
- **Risks:** Accessibility baselines still pending (from RES follow-ups); design must leave hooks for screen readers and high-contrast themes.

### Hub System (MUD-style)
- **Responsibilities:** Provide structured rooms, exits, and verb-limited interactions when players enter shared hubs.
- **Flow:** Web UI toggles to hub command router; commands validated server-side and recorded as events for offline consolidation.
- **Integration:** Shares session memory context with Narrative Engine when a hub interlude impacts solo play outcomes.
- **Risks:** Preventing hub interactions from prematurely mutating persistent state; needs clear hand-off into the offline pipeline.

### Offline Post-Session Pipeline
- **Stages:**
  1. **Story Consolidation** – condenses transcripts into publishable recaps.
  2. **Named Entity Resolution (NER)** – extracts entities, updates lore candidates, flags conflicts.
  3. **Delta Determination** – proposes world changes, queues for admin moderation.
  4. **Publishing Cadence** – schedules wiki/news updates, triggers notifications.
- **Infrastructure:** Temporal orchestrated jobs pulling from event-sourced transcript store; CRDT-backed conflict resolution for collaborative edits.
- **Risks:** Storage overhead for long sessions; requires metadata pruning and compression strategies.

### Lore & Wiki Publishing Stack
- **Responsibilities:** Surface canonized summaries, news blasts, and faction updates for players/admins.
- **Data Sources:** Outputs from Delta Determination, manual admin edits, curated artefacts.
- **Delivery:** Web UI overlays, public API endpoints, background sync to offline caches.
- **Risks:** Ensuring provenance is displayed to maintain trust; requires audit trail links from admin console.

## Cross-System Interactions
- Narrative Engine and Check Runner exchange structured intents/results via Temporal queue topics (`intent.checkRequest`, `event.checkResolved`).
- Unified Web UI subscribes to `event.sessionUpdate` for GM replies and `event.telemetrySnapshot` for transparency widgets.
- Hub System events are tagged with `scope:hub` so offline pipeline can route them through the same Story Consolidation path with additional conflict scrutiny.
- Offline pipeline writes curated deltas to Lore/Wiki store; admin console surfaces pending approvals before publication.
- All systems stream telemetry into a shared event store (e.g., Kafka/Redpanda) that powers cost/latency dashboards and audit replay.

## Dependencies & Open Questions
- **Accessibility Baseline:** Need explicit design tasks to benchmark screen reader performance and offline fallback interactions (RES follow-up #5).
- **Search Stack Decision:** Pending Meilisearch vs. pg_trgm benchmarking (RES follow-up #3) influences Lore/Wiki querying strategy.
- **Temporal Cost Envelope:** Requires modelling session volume vs. workflow throughput to stay under $150/month (RES follow-up #2).
- **Conflict Resolution Playbook:** Clarify how admins reconcile simultaneous delta proposals before implementation phase.
- **Data Retention:** Decide retention windows for raw transcripts vs. consolidated lore to manage storage costs.

## Next Actions
1. Elaborate component interface contracts (API surfaces, event schemas) for Narrative Engine ↔ Check Runner ↔ UI interactions.
2. Draft accessibility acceptance criteria and testing strategy for the Web UI shell.
3. Schedule benchmarking spikes for search stack and Temporal throughput (coordinate with outstanding research follow-ups).
4. Prepare initial architecture decision record covering global system boundaries (DES-11 outcome).

## References
- `MARKET_RESEARCH_SUMMARY.md`
- `docs/research/session-10-market-research-brief.md`
- MCP research cache `94a66ac4-9fba-4bf2-9588-4f0d87205fc8`
- `REQUIREMENTS.md`
