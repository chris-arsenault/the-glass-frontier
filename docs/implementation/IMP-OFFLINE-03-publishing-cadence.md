# IMP-OFFLINE-03 – Publishing Cadence & Search Sync

**Backlog Anchor:** IMP-OFFLINE-03 (Publishing Cadence & Search Sync)  
**Feature:** IMP-OFFLINE – Post-Session Publishing Pipeline  
**Design References:** DES-15, DES-16, REQUIREMENTS.md, architecture decision `df2a9cf7-9776-4721-adbb-6fbed028433f`, pattern `temporal-lore-publishing-cadence`

## Summary
- Implemented `PublishingCadence` and `PublishingStateStore` to blueprint moderation windows, hourly lore batches, and nightly digest runs with admin overrides capped at 12 hours.
- Added `BundleComposer` to transform approved deltas into lore bundles, news cards, and overlay payloads while attaching provenance, safety tags, and history-aware revisions.
- Introduced `SearchSyncPlanner` and `PublishingCoordinator` for search job planning, telemetry wiring, and end-to-end orchestration across cadence scheduling, content packaging, and search drift detection.
- Logged cadence and search telemetry through `PublishingMetrics`, ensuring publish batches and drift warnings propagate to the observability surface.

## Code Surfaces
| Path | Purpose |
| --- | --- |
| `src/offline/publishing/publishingStateStore.js` | Maintains cadence session state, history, and override records. |
| `src/offline/publishing/publishingCadence.js` | Derives moderation windows, batch schedules, digest runtime, and admin overrides per DES-16. |
| `src/offline/publishing/bundleComposer.js` | Applies deltas to lore/news structures and prepares overlay payloads with provenance. |
| `src/offline/publishing/searchSync.js` | Builds search indexing jobs and flags drift when Meilisearch versions lag. |
| `src/offline/publishing/publishingCoordinator.js` | Orchestrates cadence scheduling, publishing prep, telemetry, and search evaluation. |
| `src/telemetry/publishingMetrics.js` | Emits `telemetry.publish.*` and `telemetry.search.*` events for cadence operations. |
| `src/offline/index.js` / `src/offline/publishing/index.js` | Aggregate exports for the offline pipeline’s publishing components. |

## Telemetry & Search
- `PublishingMetrics` logs `telemetry.publish.batch.prepared`, `telemetry.publish.batch.published`, and `telemetry.search.drift`, enabling dashboards to surface cadence latency and search health.
- `SearchSyncPlanner` generates Meilisearch/pg_trgm-ready jobs and reports version mismatches or failures back to telemetry for `telemetry.search.drift`.
- `PublishingCoordinator.markBatchPublished` captures latency against scheduled run times to support DES-16 observability requirements.

## Testing
- `npm test` (passes) covering new publishing cadence, bundler, search sync, and coordinator units.

## Follow-Ups
1. Persist cadence state, bundles, and search jobs to PostgreSQL/MinIO instead of in-memory stores once infrastructure comes online.
2. Wire coordinator output to Temporal activities and admin UI panels for live moderation countdowns.
3. Register digest synthesis workflow and email/webhook distribution channels per DES-16 once story consolidation feeds daily chapters.
