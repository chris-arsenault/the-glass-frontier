# IMP-OFFLINE-01 – Story Consolidation Workflow MVP

## Summary
- Introduced a `StoryConsolidationWorkflow` orchestrator that ingests CouchDB change-feed events or raw transcripts, composes scene/act recaps, and persists artefacts through injectable storage adapters.
- Authored a deterministic `SummaryComposer` that segments transcripts by scene/act, captures hooks, momentum deltas, and highlights, and feeds consolidated statistics into downstream pipelines.
- Added an attachment planner plus in-memory summary store, exported the workflow via `src/offline/index.js`, and emitted `intent.storyConsolidation.summaryReady` envelopes with dedicated telemetry metrics.

## Architecture Notes
- The workflow resolves data from either explicit transcripts or change-feed events using `assembleTranscriptFromEvents`, ensuring Temporal workers can resume idempotently.
- Summarisation heuristics target auditability: only GM messages set default tension, player metadata drives achievements/momentum, and safety annotations merge transcript flags with offline safety events.
- Persistence remains adapter-driven. Default `InMemorySessionSummaryStore` supports local testing while a new migration seeds the PostgreSQL `session_summaries` table with `summary_metrics` for production.
- Metrics and events surface via `StoryConsolidationMetrics`, logging start/completion/attachment telemetry for observability dashboards and moderation readiness.

## Data & Storage
- Migration `db/migrations/20251105_create_session_summaries.sql` creates `session_summaries` with JSONB columns for scene breakdowns, act summaries, player highlights, safety notes, and summary metrics, plus a generated-at index.
- Attachments funnel through `AttachmentPlanner`, deferring to an injected MinIO-backed artefact store; defaults no-op in local runs while still annotating provenance.

## Telemetry & Events
- New telemetry channels:
  - `telemetry.storyConsolidation.started|completed|failed`
  - `telemetry.storyConsolidation.attachments.persisted`
- Summary completion broadcasts `intent.storyConsolidation.summaryReady` with sanitized payloads and provenance for downstream entity extraction and publishing jobs.

## Testing & Verification
- `npm test -- --runTestsByPath __tests__/unit/offline/storyConsolidationWorkflow.test.js`
- `npm test`

## Follow-ups
- Swap the in-memory summary store for a Postgres DAO and inject the real MinIO client once platform storage features land.
- Wire Temporal workers to schedule the workflow based on session closure/idle triggers and persist provenance identifiers to moderation dashboards.
- Extend regression coverage with sample transcripts hitting multilingual hooks and extended momentum arcs before rolling to production data.

