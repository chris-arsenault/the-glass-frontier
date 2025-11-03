# DES-15 – Persistence & Lore Pipeline Blueprint

Backlog anchor: `DES-15`, Feature: `DES-CORE`

## Purpose
Translate research from RES-07 and RES-08 plus prior design artefacts into a concrete, self-hosted architecture for The Glass Frontier’s post-session processing. The blueprint defines how raw session events become consolidated stories, entity graph updates, and publishable lore while preserving freeform agency, auditability, and the prohibition on mid-session world mutations.

## Guiding Tenets
- **Narrative-first persistence:** Keep the live session lightweight; every durable change flows through an offline pipeline that respects player intent and embeds provenance.
- **Event-sourced transparency:** Capture every beat—including safety interventions and check outcomes—as immutable events so downstream reconciliations are deterministic and auditable.
- **Self-hosted reliability:** Favor CouchDB, PostgreSQL, Temporal, and Meilisearch/pg\_trgm to stay inside the bootstrap budget and avoid managed lock-in.
- **Safety baked in:** Enforce the Prohibited Capabilities List and moderation cues during delta determination before anything reaches canon.
- **Latency containment:** Stage work in Temporal workflows with bounded SLAs so long-running summaries or NER passes do not block subsequent sessions.

## Pipeline Overview
The pipeline is orchestrated by Temporal and consumes session events replicated from the live stack. Mermaid sequence: `docs/design/diagrams/DES-15-persistence-pipeline.mmd`.

```
Session capture → Story Consolidation → Entity Graph Enrichment → Delta Determination & Safety → Moderation Queue → Publishing & Search Indexing
```

## Stage Breakdown

### 1. Session Event Capture & Replication
- **Source:** Narrative Engine, Hub System, Check Runner emit JSON event envelopes into `session_events` CouchDB database (one document per beat, keyed by `eventId`).
- **Replication:** CouchDB `_replicator` jobs mirror events to the offline processing cluster with checkpointed resume tokens.
- **Guarantees:** Events are append-only; revisions only append moderation annotations, never mutate prior fields. Temporal workflows subscribe via change-feed cursor.
- **Safety:** X-Card activations and safety tags are recorded inline and bubble up to moderation automatically.

> Event envelope fields are detailed in **Data Schemas**.

### 2. Story Consolidation Workflows
- **Trigger:** Temporal workflow `storyConsolidationWorkflow` starts when a session reaches `state=closed` or after 12 hours of inactivity.
- **Process:**
  - Chunk transcript by `sceneId`, apply LangGraph summarisation cascade (scene → act → session).
  - Generate player-facing recap plus admin annotations (tension curve, unresolved hooks).
  - Persist consolidated artefacts into PostgreSQL table `session_summaries` and attach to object storage (MinIO) for images/audio attachments.
- **Outputs:** `summaryReady` event with provenance references; triggers notifications for admin review dashboards.
- **Latency Target:** < 8 minutes for 200-turn session; escalate to DES-BENCH-01 if exceeded.

### 3. Entity Graph Enrichment
- **Trigger:** Temporal starts `entityExtractionWorkflow` once summaries exist.
- **Process:** spaCy/NER pass extracts entities (characters, factions, locations, artefacts, quests), scoring confidence and linking to existing IDs.
- **Storage:** Results land in PostgreSQL JSONB column `entity_mentions` and synchronize with Neo4j-lite graph projection (PostgreSQL adjacency table for bootstrap; Neo4j optional once cost allows).
- **Safety Hooks:** Low-confidence matches (`confidence < 0.6`) flagged for moderation; Prohibited Capabilities list checked against new traits or abilities.

### 4. Delta Determination & Safety Enforcement
- **Trigger:** `deltaDeterminationWorkflow` diffs new entity/relationship state against canon tables.
- **Process:**
  - Compute proposed deltas as immutable records with `before` and `after` snapshots.
  - Attach safety policy evaluation (e.g., capability violation, lore conflict, timeline collision).
  - Queue compensating events if safety veto occurs (e.g., convert to “requires rewrite”).
- **Outputs:** Delta proposals stored in PostgreSQL `world_delta_queue` and emitted to moderation queue topics.
- **Risk Mitigation:** Soft conflict detection uses CRDT semantics for per-entity fields to minimize manual merges; conflicting edits receive suggestion packs for admins.

### 5. Moderation & Provenance Console
- **Queues:** Temporal task activities push delta proposals into `moderation_tasks` (PostgreSQL) and broadcast via WebSocket to admin UI (`admin.alert` events).
- **Workflow:** Admins can approve, rewrite (append compensating event), or escalate. Every decision appends to event log as `moderationDecision` documents with references to delta IDs.
- **Audit:** Provenance chain links back to originating session event IDs and summarised beats, satisfying the transparency mandate.
- **Safety Integration:** Prohibited Capabilities updates feed into future delta determinations automatically.

### 6. Publishing & Distribution
- **Approved Deltas:** `publishingWorkflow` applies approved deltas to lore tables, generates wiki/news entries, and schedules notifications.
- **Search Indexing:** Consolidated summaries and lore updates indexed into Meilisearch (self-hosted) and pg\_trgm fallback for in-app search.
- **Player Surfaces:** Web UI overlays receive `overlay.loreLink` events with provenance badges; public web surfaces show publish date, session references, and moderation status.
- **Cadence Control:** Default publication window = daily at 09:00 UTC; admins can trigger manual releases for high-priority events.

## Data Stores & Self-Hosted Stack

| Component | Role | Rationale | Cost/Operations Notes |
|-----------|------|-----------|-----------------------|
| CouchDB (3-node cluster) | Canonical event log + replication | Built-in checkpointed replication matches offline-first requirement from RES-07. | Fits on low-cost VPS; monitor `_replicator` jobs for lag. |
| Temporal | Workflow orchestration | Provides retries, human-in-loop steps, SLA tracking. | Already adopted in prior sessions; reuse cluster. |
| PostgreSQL | Summaries, entity mentions, delta queue, lore content | SQL-friendly analytics, ties into existing stack. | Extend existing instance; enable logical replication for analytics exports. |
| MinIO | Artefact storage | Self-hosted S3-compatible bucket for transcripts, audio, art attachments. | Deploy alongside Postgres; lifecycle policies enforce retention. |
| Meilisearch (optional pg\_trgm fallback) | Lore search index | Fast full-text for published stories; can pause if budget tight. | Single-node fits bootstrap; replicate nightly to standby. |

## Data Schemas

### Session Event (CouchDB document)
```json
{
  "eventId": "evt-uuid",
  "sessionId": "ses-uuid",
  "sceneId": "scn-uuid",
  "turnSequence": 142,
  "timestamp": "2025-11-05T19:45:00Z",
  "actor": { "role": "player", "name": "Riven Kepler", "characterId": "char-ember" },
  "beat": {
    "summary": "Riven bargains with the Ember Choir for salvage rights.",
    "tension": "rising",
    "tags": ["faction:ember-choir", "location:glimmer-hold"]
  },
  "mechanics": {
    "checkId": "chk-uuid",
    "tier": "partial-success",
    "momentumShift": -1,
    "complicationSeeds": ["security-alert"]
  },
  "moderation": { "flags": ["x-card"], "status": "needs-review" },
  "links": {
    "transcriptRange": "00:14:21-00:16:05",
    "provenance": ["capture:client-alpha", "annotator:admin-02"]
  }
}
```

### Story Summary (PostgreSQL `session_summaries`)
| Column | Type | Notes |
|--------|------|-------|
| `session_id` | UUID | Foreign key to session metadata |
| `version` | INT | Incremented when summaries are regenerated |
| `scene_breakdown` | JSONB | Array of scene summaries with tension markers and unresolved hooks |
| `act_summary` | JSONB | Act-level rollups (text, key beats, momentum arcs) |
| `player_highlights` | JSONB | Struct for achievements, earned assets, debts |
| `safety_notes` | JSONB | References to flagged events needing admin edits |
| `attachments_url` | TEXT | MinIO bucket path |
| `generated_at` | TIMESTAMPTZ | Audit timestamp |

### Delta Proposal (PostgreSQL `world_delta_queue`)
| Column | Type | Notes |
|--------|------|-------|
| `delta_id` | UUID | Primary key |
| `entity_id` | UUID | Target entity (character, faction, location, item, quest) |
| `delta_type` | TEXT | `state-change`, `new-entity`, `relationship-update`, `retcon` |
| `before_state` | JSONB | Snapshot prior to proposed change |
| `after_state` | JSONB | Proposed new state |
| `safety_assessment` | JSONB | `{ "prohibitedCapability": false, "timelineConflict": false, "confidence": 0.74 }` |
| `source_events` | JSONB | Array of `{ eventId, sceneId, summary }` |
| `status` | TEXT | `pending`, `approved`, `rewrite-requested`, `escalated`, `rejected` |
| `moderation_notes` | JSONB | Rich text plus provenance for admin actions |
| `created_at` | TIMESTAMPTZ | When workflow enqueued proposal |

## Retention & Provenance Policies
- **Raw events:** Retain for 12 months (matches REQUIREMENTS.md). Compact via CouchDB filtered replication, then archive to cold storage.
- **Summaries & lore:** Persist indefinitely; mark revisions with version history and provenance chain to original session.
- **Delta proposals:** Retain approved deltas for the life of the product; rejected proposals archived after 6 months with provenance intact for audits.
- **Moderation decisions:** Never delete; store compensating events rather than mutation.
- **Privacy & redaction:** Redactions append `retcon` delta with reason and reference to policy; original event remains but is hidden from public surfaces.

## Risks & Mitigations
- **Temporal backlog spikes:** Mitigate with workflow sharding by `sessionId` and monitoring queue depth (`telemetry.snapshot`). DES-BENCH-01 benchmarks workflow latency to validate budgets.
- **NER drift or hallucination:** Track confidence metrics; require admin confirmation below 0.6; maintain test corpus for regression.
- **Conflict storms after major events:** Implement priority bundling so related deltas batch together, reducing admin clicks. Provide `bulk decision` tools in moderation console (follow-up for DES-MOD-01).
- **Storage growth:** Schedule monthly compaction and archiving jobs; enforce MinIO lifecycle rules to move cold attachments to glacier-tier storage.
- **Security & compliance:** All replication channels use TLS; audit logs streamed to event store. Access controls align with admin role definitions from upcoming DES-18 work.

## Follow-Ups & Dependencies
- Coordinate with `DES-BENCH-01` to benchmark workflow concurrency, CouchDB replication lag, and summarisation cost envelopes.
- Inform `DES-MOD-01` with moderation queue requirements: per-delta telemetry, compensating event shortcuts, provenance visualization.
- Seed implementation backlog with tasks for MinIO deployment, summary regression suite, and CRDT-backed admin note editor.
- Maintain linkage to Prohibited Capabilities List service so enforcement remains up to date.

## References
- `docs/research/session-07-offline-pipelines-and-moderation.md`
- `docs/research/session-08-story-consolidation-world-deltas.md`
- `docs/design/DES-11-global-systems-map.md`
- `docs/design/DES-12-interface-schemas.md`
- `docs/design/DES-13-rules-framework.md`
- `REQUIREMENTS.md`
