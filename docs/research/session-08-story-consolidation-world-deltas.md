# Session 08 – Story Consolidation & World Delta Integration

Backlog anchor `RES-08` deepens the multiplayer world integration research by codifying how Story Consolidation output feeds Named Entity Recognition (NER), delta computation, and moderation checkpoints before canon updates occur.

## Research Goals
- Frame an offline-first transformation path from raw transcripts to publishable lore and structured world deltas.
- Identify lightweight—but auditable—interventions for reconciling parallel sessions without stalling narrative flow.
- Select self-hosted building blocks for summarisation, entity harvesting, and change detection that align with bootstrap cost assumptions.

## Pipeline Snapshot

1. **Session Transcript Capture** → chunk scenes with timestamps, speaker roles, tags (faction, tension level).  
2. **Layered Summarisation** → cascade scene → act → session summaries, preserving links back to transcript offsets.[^langchain-summarize]  
3. **Domain-Tuned NER** → extract characters, locations, artefacts, and provisional lore beats while flagging confidence gaps for admin review.[^spacy-ner]  
4. **Knowledge Graph Projection** → merge entities into a relationship graph that tracks provenance and potential conflicts.[^neo4j-kg]  
5. **Delta Determination** → compute proposed world updates by diffing the new graph snapshot against canon using change-data capture patterns.[^debezium-arch]  
6. **Workflow Orchestration & Moderation** → drive each stage via durable workflows with retry semantics and human-in-the-loop hooks for moderation sign-off.[^temporal-concepts]

## Event Log Metadata Blueprint

To keep projections reproducible across summarisation, NER, and delta determination, every transcript event needs shared metadata scaffolding that records provenance and narrative context.[^prov-dm] The schema below balances immersion (no rigid verb gating) with the fields downstream processors require.

```json
{
  "eventId": "evt-<uuid>",
  "sessionId": "ses-<uuid>",
  "sceneId": "scn-<uuid>",
  "timestamp": "2025-11-03T19:45:00Z",
  "actor": {
    "type": "player|gm|npc",
    "name": "Riven Kepler",
    "factionId": "fac-embers"
  },
  "beat": {
    "summary": "Riven bargains with the Ember Choir for salvage rights.",
    "tension": "rising",
    "tags": ["faction:ember-choir", "location:glimmer-hold"]
  },
  "mechanics": {
    "checkType": "fortune",
    "result": "mixed-success",
    "roll": 7,
    "advantageSource": "rule-of-cool"
  },
  "moderation": {
    "flags": ["x-card"],
    "status": "needs-review"
  },
  "links": {
    "transcriptRange": "00:14:21-00:16:05",
    "priorEventId": "evt-<uuid>",
    "provenance": ["capture:client-alpha", "annotator:admin-02"]
  }
}
```

- `sceneId`, `tension`, and `tags` let Story Consolidation cluster beats into acts while tagging factions and locations for future world deltas.
- Embedding `mechanics` preserves transparent success checks for the post-session auditor without exposing them to live players.
- `links.provenance` aligns with PROV-DM expectations so later revisions can audit which client or admin touched a beat.[^prov-dm]

## Self-Hosted Append-Only Store Comparison

| Store | Strengths for Story Consolidation | Gaps / Concerns | Operational Notes |
| --- | --- | --- | --- |
| CouchDB | `_changes` feeds and `_replicator` docs resume multi-node sync after offline capture, preserving revision history for conflicting edits.[^couchdb-replication] | Document-level conflicts still need custom resolution logic for event ordering; change feeds can lag under bursty writes. | Single binary deployment but Erlang/BEAM tuning is required for high write volumes. |
| EventStoreDB (Kurrent) | Streams guarantee append-only ordering with server-side projections, matching event-sourced transcript needs.[^kurrent-docs] | Requires running the cluster (≥3 nodes) and learning proprietary query APIs; no built-in document store for ancillary assets. | Purpose-built for event sourcing; exposes stream metadata and soft-deletion for audit trails. |
| PostgreSQL + Logical Replication | Outbox pattern on top of relational tables keeps SQL-friendly admin queries while streaming change events to processors.[^postgres-logical] | Logical decoding requires careful slot management; conflict handling replays at row granularity rather than domain events. | Fits existing PostgreSQL toolchains; can share infrastructure with session analytics. |
| NATS JetStream | Lightweight Go binary offers durable message streams with ack-based consumer flow control, good for retrying background workers.[^nats-jetstream] | Streams are byte-oriented; higher-level projections must enforce ordering and idempotency manually. | Clusters scale horizontally; monitoring via built-in advisories surfaces stalled consumers quickly. |

## Admin Review & Moderation UX Concepts

- Queue rare interventions by session and scene, showing event metadata, replication checkpoints, and workflow status so moderators see what stalled and why.[^pai-guidebook]
- Provide fast “approve / rewrite / escalate” actions that append compensating events rather than mutating history, mirroring Matrix’s guidance for reversible moderation.[^matrix-moderation]
- Surface telemetry (replication lag, JetStream consumer backlog, Temporal workflow retries) inline with narrative context so admins decide whether to unblock pipelines or request rewrites.[^pai-guidebook]
- Log moderator annotations as structured events that reuse the metadata schema, keeping provenance tidy for downstream publishing.[^prov-dm]

## Comparative Notes

| Source | Story Consolidation & Summaries | Entity & Delta Handling | Moderation / Ops Hooks |
| --- | --- | --- | --- |
| LangChain Summarisation Chain[^langchain-summarize] | Iterative-refine chains summarise long transcripts by chunking and stitching, keeping references to original spans. | Generates hierarchical summaries that downstream NER can traverse scene-by-scene. | Summaries can inject TODO markers (e.g., “Needs GM confirmation”) that the workflow surfaces as tasks. |
| spaCy Linguistic Features[^spacy-ner] | Provides custom pipeline components so domain rules (magitech factions, prohibited powers) embed early in processing. | Supports entity linking to external IDs, enabling graph merges and duplicate detection. | Confidence scores allow background jobs to route low-certainty entities to moderators while high-certainty entries auto-advance. |
| Neo4j Knowledge Graph + NLP[^neo4j-kg] | Demonstrates turning unstructured narratives into graph nodes with weighted relationships and provenance metadata. | Graph algorithms surface conflicting claims (e.g., mutually exclusive location states) before deltas publish. | Graph queries highlight moderation-needed components (cycles, contradictions) for admin dashboards. |
| Debezium Architecture[^debezium-arch] | Change-data capture streams provide a diffable event log that downstream services consume consistently. | Outbox patterns translate proposed deltas into canonical updates once approved, ensuring idempotency. | Connector health metrics expose stalled processors; moderators can pause or replay without data loss. |
| Temporal Platform Concepts[^temporal-concepts] | Durable Workflows encapsulate Story Consolidation stages and resume cleanly after crashes or deploys. | Signals let moderation or admin tools inject manual overrides (approve/alter/reject) mid-flow. | Built-in visibility APIs feed status consoles so producers see where transcripts are waiting on human action. |

## Findings

### 1. Layered Summaries Anchor Later Stages
- Iterative summarisation chains keep references back to transcript offsets, letting NER and admins jump directly to the underlying beats when reconciling conflicts.[^langchain-summarize]
- Scene-level metadata (speakers, factions, tension markers) should travel with each summary layer so later projections understand narrative dependencies.

### 2. Domain-Specific NER Enables Safer Automation
- spaCy pipelines allow custom entity rulers and transformers, letting us codify magitech vocabularies and prohibited capabilities before world deltas commit.[^spacy-ner]
- Entity linking attaches consistent IDs, simplifying graph merges and highlighting when two sessions refer to the same faction or item under different epithets.

### 3. Knowledge Graphs Surface Conflicts Before Publish
- Projecting extracted entities into a knowledge graph provides a workspace for diffing proposed canon against existing lore, revealing contradictions or missing relationships.[^neo4j-kg]
- Weighting edges by transcript confidence or moderator overrides helps triage which deltas can auto-merge versus those requiring explicit approval.

### 4. Durable Workflows Keep Offline Pipelines Trustworthy
- Temporal’s durable execution model ensures Story Consolidation workflows survive node failures, mirroring the resilience needs flagged in Session 07’s replication research.[^temporal-concepts]
- Embedding moderation checkpoints as workflow activities or signals keeps rare interventions fast without baking humans into the hot path for every beat.

### 5. Change-Data Capture Patterns Deliver Clean Deltas
- Debezium’s outbox/change-event model shows how to broadcast approved deltas to downstream consumers (wiki, newsfeed) without double-applying updates.[^debezium-arch]
- CDC metrics double as backlog signals: stalled connectors indicate where moderators or engineers must intervene before the world state drifts.

### 6. Event Metadata Must Encode Narrative Context
- A shared schema carrying scene IDs, tension markers, and faction/location tags keeps summarisation, NER, and delta projections aligned without forcing verb gating or rigid commands.[^prov-dm]
- Provenance lists document which capture clients or moderators touched an event, giving admins auditable trails when they reconcile retcons or safety interventions.[^prov-dm]

### 7. Store Selection Should Balance Ops Load and Auditability
- CouchDB’s change feeds and revision history make it the bootstrap default, but high-conflict sessions still need custom ordering routines on top of the document model.[^couchdb-replication]
- EventStoreDB streams, PostgreSQL logical replication, and NATS JetStream provide upgrade paths when we need stricter ordering guarantees or leaner binaries while keeping change telemetry observable for admins.[^kurrent-docs][^postgres-logical][^nats-jetstream]

### 8. Admin Surfaces Need Telemetry Plus Narrative Context
- Review queues should pair narrative beat metadata with replication and workflow health signals so rare interventions happen with full situational awareness.[^pai-guidebook]
- Moderation actions ought to append compensating events—not overwrite history—to mirror the reversible moderation guidance from Matrix communities.[^matrix-moderation]

## Implications for The Glass Frontier
- Build Story Consolidation as a **Temporal** workflow that orchestrates summarisation, NER, graph projection, and delta emission with retry semantics and human override points.
- Embed the event-log metadata schema in capture services so every beat carries scene IDs, mechanics, and provenance before it leaves the client.
- Standardise on **spaCy-powered NER** with custom rulers for Glass Frontier lore to pre-classify entities and prohibited capabilities before they reach canon.
- Maintain a **Neo4j (or equivalent) knowledge graph cache** of proposed vs. accepted lore so admins visualise conflicts and provenance during weekly publish cadences.
- Wrap approved deltas in a **Debezium-style outbox** to fan out updates to lore databases, news feeds, and hub instances while retaining idempotency.
- Treat summarisation artefacts as first-class records linked to transcripts, enabling future replays or retcons without reprocessing entire sessions.
- Keep **CouchDB** as the bootstrap log store but document a migration runway to **EventStoreDB** or **NATS JetStream** when throughput or ordering guarantees outgrow the document model.
- Design the admin review console to surface workflow/replication telemetry next to narrative context so moderators can append compensating events without stalling publication.

## Open Questions & Next Steps
- Build a thin ingestion prototype that emits the metadata schema and measures storage/throughput impact on short, medium, and long transcripts.
- Run a maintenance spike comparing CouchDB, EventStoreDB, and NATS JetStream ops costs (backups, upgrades, observability) for the projected session cadence.
- Draft admin review wireframes that fuse narrative beats with workflow/replication telemetry and compensating-event shortcuts.
- Define retention and redaction policies for moderation events so provenance trails stay auditable without over-exposing sensitive context.

[^langchain-summarize]: LangChain Documentation. “Summarization.” <https://python.langchain.com/docs/modules/chains/document_transformers/summarize>
[^spacy-ner]: Explosion. “Linguistic Features – Named Entities.” <https://spacy.io/usage/linguistic-features#named-entities>
[^neo4j-kg]: Neo4j. “From Natural Language Processing to Knowledge Graphs.” <https://neo4j.com/blog/knowledge-graphs-natural-language-processing/>
[^debezium-arch]: Debezium. “Debezium Architecture.” <https://debezium.io/documentation/reference/stable/architecture.html>
[^temporal-concepts]: Temporal Technologies. “What is Temporal?” <https://docs.temporal.io/concepts/what-is-temporal>
[^prov-dm]: W3C. “PROV-DM: The PROV Data Model.” <https://www.w3.org/TR/prov-dm/>
[^couchdb-replication]: Apache CouchDB Documentation. “Introduction to Replication.” <https://docs.couchdb.org/en/stable/replication/intro.html>
[^kurrent-docs]: Kurrent. “Kurrent Docs – Stream Database for Event Sourcing.” <https://docs.kurrent.io/>
[^postgres-logical]: PostgreSQL Documentation. “Chapter 29. Logical Replication.” <https://www.postgresql.org/docs/current/logical-replication.html>
[^nats-jetstream]: Synadia Communications. “NATS JetStream.” <https://docs.nats.io/jetstream>
[^pai-guidebook]: Google PAIR. “People + AI Guidebook.” <https://pair.withgoogle.com/guidebook/>
[^matrix-moderation]: Matrix.org. “Moderation in Matrix.” <https://matrix.org/docs/older/moderation/>
