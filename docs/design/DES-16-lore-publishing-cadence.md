# DES-16 – Lore Publishing Cadence & Surfaces

Backlog anchor: `DES-16`, Feature: `DES-CORE`

## Purpose
Extend the persistence blueprint from DES-15 by defining when and how post-session artefacts move into public canon. This session locks down the Temporal-driven cadence that hands consolidated stories to moderation and publishing, specifies the content bundles exposed to the unified web client, and captures retention plus rollback policies so lore remains audit-ready without constraining freeform sessions.

## Guiding Tenets
- **Cadenced transparency:** Publish on predictable beats (hourly batch + nightly digest) so players understand when their sessions surface while admins retain an override buffer.
- **Surface parity:** Deliver the same canonical content to wiki, news ribbon, and in-client overlays with per-surface trims, ensuring the narrative stays coherent regardless of entry point.
- **Immutable provenance:** Every publish bundle references originating events, moderation decisions, and safety checks so later retcons append deltas rather than mutate history.
- **Operational resilience:** Treat failure handling, retention, and rollback budget as first-class citizens to avoid backlog spikes across Temporal workflows or search indices.

## Cadence Blueprint

Temporal orchestrates three linked workflows after the pipelines documented in DES-15 complete:

| Window (relative to session close) | Workflow | Responsibilities | Output Targets |
| --- | --- | --- | --- |
| T+00:15 | `moderationWindowWorkflow` | Opens a 45-minute admin window to approve, rewrite, or escalate delta proposals. Sends escalating alerts at +30 min and +40 min if queues remain. | Admin console (`admin.alert`), moderation dashboard metrics |
| T+01:00 | `loreBatchPublishWorkflow` | Publishes approved deltas in batches grouped by session or faction. Applies wiki mutations (`wiki_entry`), queues news flashes, and emits overlay payloads. | Lore wiki API, in-client overlays (`overlay.loreLink`), search indexing |
| T+08:00 (02:00 local) | `dailyDigestWorkflow` | Compiles the past day’s approved changes into digestible story arcs, flags hot spots for marketing, and snapshots key telemetry. | News digest feed, email/web notifications, admin analytics |

- **Override rules:** Admins can defer a batch up to 12 hours per session before a fail-safe marks it “needs rewrite” and pauses publication.
- **Back-pressure:** If moderation backlog > 50 items, `moderationWindowWorkflow` spawns an escalation to DES-MOD-01 tooling and slows new summaries by toggling `moderationBacklog` flag, signaling Narrative Engine to temper new canon hooks.
- **Synchronization:** Each workflow writes status records into `publishing_state` table (PostgreSQL) so UI dashboards present current stage and pending operations.

See `docs/design/diagrams/DES-16-publishing-cadence.mmd` for the sequence diagram.

## Content Packages

### 1. Lore Wiki Bundles
- **Envelope:** `loreBundle` JSON written to PostgreSQL `lore_entries` with shadow copy in CouchDB for editor previews.
- **Fields:** `{ bundleId, entityRefs[], summaryMarkdown, revisions[{version, deltaId, editor}], provenance{sessionId, moderationDecisionId}, safetyTags[] }`.
- **Workflow:** Each approved delta maps to an entity or lore topic; bundler merges compatible deltas using CRDT merge keys to preserve admin annotations.
- **UI:** Unified client fetches bundles via `/api/lore/{bundleId}` with etag-based caching; offline clients fallback to last-synced copy from IndexedDB.

### 2. News Flash Cards
- **Envelope:** `newsCard` stored in PostgreSQL `news_feed` and surfaced through Meilisearch for fast retrieval.
- **Fields:** `{ cardId, headline, lead, factionTags[], urgency, publishAt, expiresAt, cardType("flash"|"digest"), provenanceRefs[] }`.
- **Cadence:** Produced alongside `loreBatchPublishWorkflow` with staggered `publishAt` windows so players see flash updates ahead of the daily digest.
- **Accessibility:** Cards carry `ariaSummary` strings sourced from DES-12 accessibility hooks; card imagery references MinIO assets with alt text.

### 3. Digest Chapters
- **Envelope:** Markdown chapter files written to MinIO (`digests/{YYYY-MM-DD}/{slug}.md`) plus index metadata in PostgreSQL `daily_digests`.
- **Fields:** `{ digestId, date, sections[{title, abstract, linkedBundles[] }], timeline[{timestamp, summary}], adminNotes }`.
- **Distribution:** Daily digest workflow posts notifications via WebSocket (`overlay.loreLink` with `context:"digest"`), optional email webhook, and admin analytics export.
- **Moderation:** Digests inherit the status of underlying bundles; if any section is deferred, the digest marks it as `pending` and includes a transparency notice to maintain trust.

## Admin & Client Touchpoints
- **Moderation Console:** Gains cadence strip showing countdown timers for each stage, backlog counts, and override controls. Uses `publishing_state` records plus `moderationBacklog` flag to surface risk.
- **GM HUD:** Receives `session.marker` updates when related sessions are awaiting admin action, encouraging wrap-ups that respect cadence constraints.
- **Player UI:** Chat overlay introduces “Lore Drop ETA” pill for sessions in `T+00:15` to set expectations; news ribbon auto-refreshes when new `newsCard` entries reach `publishAt`.
- **Search & Indexing:** Meilisearch ingests `loreBundle` and `newsCard` documents with synonyms seeded from research Session 07. Re-index jobs run after each publish batch; failures trigger automatic retries with exponential backoff.

## Retention, Rollback & Failure Handling
- **Retention:** Lore bundles persist indefinitely; daily digests keep raw Markdown for 5 years then archive to cold storage. News cards expire after 90 days but maintain provenance metadata. Publishing state logs retain for 18 months to support cadence audits.
- **Rollback:** Retcons append new deltas tagged `retcon` that supersede prior bundles. Publishing workflows never delete; instead, they mark affected bundles with `supersededBy` references so UI can display version history.
- **Failure Modes:**
  - **Moderation timeout:** Auto-defers session with `needs rewrite` flag and notifies admins + players through overlay note.
  - **Indexing failure:** Workflow retries thrice; on persistent failure, marks `searchOutOfSync=true` and opens ticket in backlog (`phase:implementation`, `tag:search`) with logs attached.
  - **Digest generation stall:** If summarisation takes > 10 minutes, fallback publishes lean digest (headlines only) and queues follow-up to regenerate with full content.
- **Observability:** `telemetry.publish.latency`, `telemetry.publish.failure`, and `telemetry.moderation.backlog` metrics feed dashboards plus DES-BENCH-01 benchmarking plan.

## Risks & Follow-Ups
1. **Moderation overload during peak events:** Mitigate with elastic staffing model and queue auto-prioritisation. Follow-up backlog: `DES-MOD-01` to include backlog triage UI and batch decision tooling.
2. **Search index drift under heavy publishing:** Require implementation backlog item for differential re-indexing and failover search caches.
3. **Attachment storage sprawl:** Coordinate with future MinIO lifecycle backlog to enforce tiering policies (object tagging, glacier move rules).
4. **Transparency gaps if digests omit deferred sections:** UI must clearly badge pending content; create copy guidelines and QA checks to ensure phrasing remains player-friendly.

## Implementation Seeds
- Implementation backlog items to draft post-design:
  - MinIO lifecycle automation (ties back to DES-15 follow-up).
  - Search re-index job with failure alerting.
  - Digest generation regression suite covering markdown formatting, accessibility checks, and timezone handling.
  - Admin cadence strip component within moderation console.
- Reference this document when opening implementation tasks to ensure consistent schema naming and provenance handling.

## References
- `docs/design/DES-15-persistence-lore-pipeline.md`
- `docs/research/session-07-offline-pipelines-and-moderation.md`
- `docs/research/session-08-story-consolidation-world-deltas.md`
- `REQUIREMENTS.md`
- Architecture decision `5ff61d14-f7c2-450a-a130-70e61d858646`
- Architecture decision `df2a9cf7-9776-4721-adbb-6fbed028433f`
- Pattern `temporal-lore-publishing-cadence` (`8fa204a0-c7f5-444d-8c5f-232f8e60086c`)
