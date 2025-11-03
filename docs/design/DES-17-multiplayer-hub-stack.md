# DES-17 – Multiplayer Hub Real-Time Stack

Backlog anchor: `DES-17`, Feature: `DES-CORE`

## Purpose
Define the multiplayer hub real-time architecture that powers verb-limited shared spaces while preserving The Glass Frontier’s narrative-first ethos. This artefact specifies transports, orchestration boundaries, state synchronisation, and moderation hooks so hub encounters remain performant, auditable, and aligned with offline publishing pipelines.

## Guiding Tenets
- **Narrative continuity:** Hubs extend solo sessions without breaking the mandate that durable world deltas only emerge post-session.
- **Strict verbs, rich context:** Command parsing enforces whitelist verbs yet passes scene lore, momentum, and safety tags into the Narrative Engine for contextual responses.
- **Self-hosted stack:** Prefer lightweight Node.js services, Redis, and Temporal extensions that fit the bootstrap budget while avoiding managed dependencies.
- **Transparent automation:** Every hub action emits telemetry and provenance linking back to the originating player/NPC and resulting narrative beats.
- **Resilience before scale:** Prioritise deterministic recovery (reconnect, replay, snapshotting) so long-running sessions survive network hiccups.

## Architecture Overview
```
Player Client (Web UI)
        |  wss://session/{sessionId}
        v
Hub Gateway (uWebSockets.js + Auth middleware)
        |
        v
Command Parser & Verb DSL
        |        +-------------------------+
        +------> | Presence & State Cache | (Redis Streams + Hashes)
        |        +-------------------------+
        v
Hub Orchestrator (Node worker cluster)
        |             |
        |             +--> Narrative Bridge (LangGraph intents)
        |             |
        |             +--> Temporal Hooks (checkRunner, story capture)
        |
        v
Event Bus (`telemetry.hub.*`, `hub.snapshot`)
        |
        +--> Offline Pipelines (Story Consolidation, Delta Determination)
```

## Component Breakdown

### Hub Gateway (Edge Transport)
- Terminates WebSocket connections using `uWebSockets.js` for low-latency fan-out with SSE fallback per `DES-12`.
- Shares authentication with the unified session socket; attaches `hubContext` (roomId, characterId, capabilities) obtained from the session token service.
- Implements heartbeat + backpressure; when buffers fill, clients receive `hub.system` warnings instructing them to pause command spam.

### Command Parser & Verb DSL
- Maintains per-hub verb catalog stored in PostgreSQL (`hub_verbs`) with localisation support and moderation flags.
- Uses a declarative DSL (YAML/JSON) to define verbs -> required parameters, cooldowns, safety constraints, and optional narrative hints.
- Validates each command against:
  - Verb whitelist & capability requirements (cross-checked with the Prohibited Capabilities registry from `DES-13`).
  - Rate limiting (burst + sustained) to deter spam.
  - Safety filters (content moderation, consent gates) before passing execution to the orchestrator.
- Emits structured `hub.command` events including `verb`, `target`, `momentumSnapshot`, and `safetyFlags`.

### Presence & State Cache
- Stores transient state in Redis:
  - `presence:{roomId}` sorted sets for active participants (players, NPCs, gm-helpers).
  - `roomState:{roomId}` hashes capturing shared variables (light level, tension clocks, trade inventory).
  - `trackers:{sessionId}` streams of recent commands for deterministic replay after reconnect.
- Redis runs self-hosted with replication + disk persistence; eviction policies avoid dropping active room state.

### Hub Orchestrator
- Horizontal Node worker pool consuming `hub.command` stream partitioned by `roomId`.
- Responsibilities:
  - Apply verb logic (resolve local effects, update shared state, queue NPC reactions).
  - Decide when to escalate to Narrative Bridge (freeform narration) or Check Runner (contest moves, risky actions).
  - Schedule shared complications using DES-EDGE-01 contested move templates when multiple actors collide.
  - Emit `hub.stateUpdate` payloads back to the Gateway for fan-out to clients.
- Persists deterministic action log (`hub.actionLog`) to CouchDB to guarantee offline pipeline parity.

### Narrative Bridge
- Packages relevant context (recent hub commands, room state, momentum, safety flags) and sends `intent.hubNarration` to the Narrative Engine via LangGraph.
- Narrative Engine synthesises responses tagged `scope:hub`, returning:
  - `session.message` narrations for the shared chat panel.
  - Optional `check.prompt` requests (if escalation needed) that flow into the existing Temporal Check Runner (DES-12/13 contracts).
- Hard-debounds prompts to prevent infinite narration loops; orchestrator enforces cooldown between narrative escalations.

### Temporal Hooks & Offline Integration
- `hub.command` outcomes requiring mechanical resolution launch `hubActionWorkflow` child workflows on Temporal:
  - If deterministic check: call existing `checkRunner` with `context.hub=true`.
  - For state snapshots: write `hub.snapshot` documents to CouchDB for Story Consolidation (DES-15) and publishing cadence (DES-16).
- Temporal workflows append `telemetry.hub.latency` metrics and queue `hub.digestCandidate` events consumed by offline summarisation.
- Offline pipeline treats hub logs as first-class inputs, ensuring hub resolutions appear in lore digests and admin moderation queues.

### Telemetry, Moderation & Audit
- All hub events publish to Kafka/Redpanda topics `telemetry.hub.command`, `telemetry.hub.state`, `telemetry.hub.safety`.
- Moderator console (future DES-18) subscribes to `admin.alert` triggered when:
  - Safety filters veto a verb.
  - Multiple `hub.command` retries indicate griefing attempts.
  - Action logs flag contested NPC authority or timeline conflicts.
- Audit trails chain: `hub.command` -> `hub.actionLog` -> `narrative message` -> `delta proposal`, meeting transparency mandates.

## Event Flow (See `docs/design/diagrams/DES-17-hub-event-flow.mmd`)
1. Player submits `/trade scrap npc=Orlan` via Web UI hub panel.
2. WebSocket Gateway authenticates, enriches with `hubContext`, and forwards to Command Parser.
3. Parser validates verb, checks Prohibited Capabilities, attaches momentum/safety snapshot, and writes to `hub.command` stream.
4. Hub Orchestrator consumes the command, updates shared state, and determines the need for narration or mechanical checks.
5. If narration needed, Orchestrator calls Narrative Bridge, which emits `session.message` and optional `check.prompt`.
6. Any mechanical check flows through the existing Temporal Check Runner, returning `check.result` to both orchestrator and clients.
7. Orchestrator emits `hub.stateUpdate` (inventory adjustments, tension meters) and writes action log to CouchDB.
8. Telemetry events broadcast for dashboards; offline pipeline ingests action logs for Story Consolidation and provenance.

## Room & Session Lifecycle
- **Creation:** When players travel to a hub, Narrative Engine emits `system.enterHub` event specifying hub id and initial verbs; Gateway ensures room instance exists, seeding state from Redis or Postgres templates.
- **Join:** Joining writes presence record, replays last N `hub.command` entries for continuity, and sends initial state snapshot.
- **Leave/Idle:** After 120s idle, orchestrator marks actor `status=idle`; after 5 minutes, connection dropped but state persists for 30 minutes for reconnection.
- **Closure:** When all players exit, orchestrator flushes final snapshot, flags session for offline summarisation, and archives state after 24 hours.

## State Synchronisation & Client Responsibilities
- `hub.stateUpdate` payloads include:
  - `version` monotonic counter
  - `diff` of changed objects (inventory delta, NPC disposition, environmental tags)
  - Optional `sceneCue` for UI (lighting, ambience)
- Clients acknowledge via `hub.ack` to enable retransmit on loss; on desync detection, Gateway serves authoritative snapshot saved in Redis.
- Service worker caches last snapshot to support offline transcript review; commands are disabled while offline, preserving design intent.

## Resilience & Scaling
- Shard orchestrator workers by `roomId % shardCount` with sticky sessions to keep command ordering deterministic.
- Redis streams provide backpressure; if lag exceeds thresholds, orchestrator emits `telemetry.hub.backlog` prompting autoscale or rate-limit.
- Deploy Gateway + Orchestrator as separate Node services (Docker) with horizontal pod autoscaling driven by concurrent connections and command throughput.
- Implement rolling snapshots to CouchDB every 30 commands to bound replay duration and support disaster recovery.
- Integrate with DES-BENCH-01 benchmarking to validate command latency (<150ms p95) and Temporal escalations (<800ms p95).

## Safety & Prohibited Capabilities Enforcement
- Command Parser rejects verbs referencing banned capabilities, surfacing narrative-friendly denial messages.
- Safety filters inspect parameters for consent-sensitive content; flagged commands reroute to moderation before execution.
- Momentum penalties apply to griefing attempts by emitting `safetyFlags: ["reckless"]`, enabling Narrative Engine to respond diegetically.
- NPC authority boundaries: orchestrator prevents players from impersonating hub NPCs unless an authorised event triggers temporary capability grants.

## Implementation Follow-Ups
- Seed implementation backlog items:
  - **IMP-HUB-01:** Build Node-based Hub Gateway + command parser skeleton with integration tests.
  - **IMP-HUB-LOAD:** Load-test hub orchestrator with 200 concurrent commands/minute, tying into DES-BENCH-01 telemetry thresholds.
  - **IMP-HUB-UX:** Design hub UI overlays (verb palette, state diff display) ensuring accessibility compliance per DES-12.
- Coordinate with DES-MOD-01 so admin override UX can inspect `hub.actionLog` entries and inject corrective actions.
- Align with DES-PVP-01 contested move schema to plug PvP-specific verbs into orchestrator branching.

## Risks & Mitigations
- **State divergence:** Mitigated by authoritative Redis snapshots + client ack/replay with idempotent action processing.
- **Latency spikes:** Benchmarked via DES-BENCH-01; fallback to queueing and narrative soft warnings when p95 exceeds thresholds.
- **Safety overload:** Automated filters escalate to moderators; incorporate cooldowns and narrative warnings to dissuade boundary pushing.
- **Operational complexity:** Keep components within Node/Redis/Temporal ecosystem already in use; avoid introducing managed services.
- **Data volume:** Periodic compaction of `hub.actionLog` and streaming to MinIO cold storage after offline processing completes.

## References
- `REQUIREMENTS.md`
- `docs/design/DES-11-global-systems-map.md`
- `docs/design/DES-12-interface-schemas.md`
- `docs/design/DES-13-rules-framework.md`
- `docs/design/DES-15-persistence-lore-pipeline.md`
- `docs/design/DES-16-lore-publishing-cadence.md`
- `docs/design/DES-EDGE-01-contested-move-playbook.md`
