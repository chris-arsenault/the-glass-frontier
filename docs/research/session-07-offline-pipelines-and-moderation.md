# Session 07 – Offline Pipelines & Moderation Gateways

Backlog anchor `RES-07` investigates how The Glass Frontier’s post-session tooling can transform raw transcripts into curated lore while surfacing rare moderation interventions and keeping persistence self-hosted.

## Research Goals
- Trace offline-first pipelines that convert transcripts into structured lore, entity deltas, and admin review queues without stalling live play.
- Identify safety and moderation patterns that respect freeform narration yet allow decisive intervention when prohibited content emerges.
- Evaluate self-hosted persistence and conflict strategies that keep queued deltas consistent across intermittently connected clients.

## Comparative Notes

| Source | Offline / Post-Session Handling | Moderation & Attention Surfacing | Persistence / Conflict Strategy |
| --- | --- | --- | --- |
| Foundry VTT – Journal Entries[^foundry-journal] | Multi-page entries (text, media, PDF) can be exported as JSON and pinned to map notes, letting GMs bundle scene assets for later publication. | Permission tiers (none → observer → owner) gate what players or admins can inspect, and context menus support curated reveal flows. | Export/import workflows reinforce versioned artefacts and allow staging copies for editing before they sync back to the canonical log. |
| CouchDB Replication Guide[^couchdb-replication] | Replication compares change feeds and replays batches; continuous jobs watch for new deltas and resume from checkpoints after outages. | `_replicator` docs expose job state via scheduler APIs, giving admins dashboards for stalled queues or conflicting updates. | Persistent replications survive restarts, push/pull modes support hub-and-spoke pipelines, and checkpoints prevent duplicate application of deltas. |
| Martin Fowler – Event Sourcing[^fowler-event] | Treat every narrative change as an event log so Story Consolidation can rebuild past states or branch summaries without rewriting history. | Event replay highlights outlier segments for admin review because the whole decision trail is available, not just the latest state. | Separate application state and event log; retroactive edits append compensating events instead of mutating prior records. |
| Yjs CRDT Documentation[^yjs-docs] | Shared types sync automatically when clients reconnect, keeping offline edits to context docks or admin notes mergeable post-session. | Observers can listen for change events, enabling moderation bots to flag edited beats while preserving author intent. | The CRDT model resolves conflicts deterministically, letting background sync or manual reconciliation happen without losing player contributions. |
| X-Card Safety Tool Article[^xcard-wiki] | Tabletop safety tools pause a scene, letting the GM mark transcripts for post-session revision without halting the entire campaign cadence. | Any participant can trigger the X-Card, requiring the facilitator to adjust or remove problematic content while logging the intervention. | The toolkit recommends rewinding or skipping scenes, implying the pipeline must support “replace segment” edits with provenance for auditing. |

## Findings

### 1. Stage Transcripts as Structured Journals
- Foundry’s journal model shows how scene artefacts (text, images, video, PDFs) can be pre-bundled, exported, and re-imported as JSON.[^foundry-journal]
- Pinning entries to map notes mirrors The Glass Frontier’s need to link session beats to locations and factions; exportable bundles become ready-made inputs for Story Consolidation.

### 2. Drive the Pipeline with Event Logs + Checkpointed Replication
- Event sourcing ensures every in-session action, moderation flag, and admin edit is captured as an append-only event, making downstream summarisation deterministic.[^fowler-event]
- CouchDB-style replication gives a self-hosted way to move events from live capture to offline processors, using `_replicator` documents for durable jobs, change feeds for incremental transfer, and checkpoints to resume after outages.[^couchdb-replication]

### 3. Moderate Rare Exceptions Without Breaking Flow
- X-Card practices demonstrate a light-touch moderation lever: any participant can excise content, and the transcript must support “rewind or skip” annotations that later editors reconcile.[^xcard-wiki]
- Permission tiers (observer vs. owner) plus admin dashboards fed by replication status create the minimal surfaces to review flagged segments without exposing the entire backlog.

### 4. Merge Offline Edits with CRDT Guarantees
- Yjs shared types offer a template for conflict-free syncing of context docks, attention markers, or admin annotations when clients work offline, directly answering Session 06’s open question about reconciling offline context edits.[^yjs-docs]
- Change listeners mean background services can watch for specific fields (e.g., prohibited-capability flags) and queue moderation events without blocking writers.

## Implications for The Glass Frontier
- Adopt an **event-sourced transcript model**: capture player and GM beats as immutable events, then derive session summaries and world deltas as projections.
- **Wrap Story Consolidation in checkpointed replication**: use a self-hosted queue (e.g., CouchDB or equivalent) so offline processors resume cleanly after connectivity loss and expose status for admins.
- **Couple journals with location/faction metadata** so exported artefacts slot directly into the lore database and can be replayed for public news cadences.
- **Integrate a safety intervention log**: X-Card activations become tagged events that mark transcript ranges for admin follow-up without derailing live narration.
- **Leverage CRDT-backed editors** for context docks and admin tooling to merge offline notes while retaining full change provenance for auditing.

## Open Questions & Next Steps
- Prototype how event logs map to existing lore schemas and what metadata (scene IDs, factions, tension levels) needs to be mandatory for downstream processors.
- Evaluate whether CouchDB or another self-hosted log store best meets bootstrap maintenance constraints; compare operational load vs. simpler append-only stores.
- Design the admin UX for reviewing safety interventions and retcon requests, including how event-level annotations surface in dashboards.

[^foundry-journal]: Foundry Virtual Tabletop. “Journal Entries.” <https://foundryvtt.com/article/journal/>
[^couchdb-replication]: Apache CouchDB Documentation. “Introduction to Replication.” <https://docs.couchdb.org/en/stable/replication/intro.html>
[^fowler-event]: Martin Fowler. “Event Sourcing.” <https://martinfowler.com/eaaDev/EventSourcing.html>
[^yjs-docs]: Yjs Documentation. “Introduction.” <https://docs.yjs.dev/readme.md>
[^xcard-wiki]: Wikipedia. “X-Card.” <https://en.wikipedia.org/wiki/X-Card>
