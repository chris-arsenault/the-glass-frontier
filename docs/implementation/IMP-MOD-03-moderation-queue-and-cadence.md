# IMP-MOD-03 – Moderation Queue & Publishing Sync

**Backlog Anchor:** IMP-MOD-03 (Moderation Queue & Publishing Sync)  
**Feature:** IMP-MOD – Moderation & Admin Surfaces  
**Design References:** DES-16, DES-18, REQUIREMENTS.md, architecture decision `0c1adab0-2d4f-495f-a952-e7cca7a46b45`

## Summary
- Added moderation queue state tracking to `SessionMemoryFacade`, wiring offline closure runs to persistent queue metadata (window timers, cadence schedule, pending delta roster).
- Extended `PublishingCoordinator` and `PublishingCadence` to surface moderation gate status, pending counts, and cadence history so publishing batches remain blocked until approvals land.
- Exposed `/admin/moderation/cadence` endpoint returning session-level cadence summaries consumed by the admin moderation dashboard.
- Implemented `ModerationCadenceStrip` UI showing SLA countdowns, pending delta counts, and quick links to review alerts, ensuring admins see publishing blocks in real time.
- Broadcast moderation queue and cadence updates over the shared transport admin channel so the dashboard reflects changes immediately after persistence.
- Wired a Temporal moderation bridge that hydrates persisted queue snapshots and forwards live cadence updates to configured Temporal endpoints using shared transport credentials.
- Aggregated cadence data now groups blocking deltas by entity/reason and highlights capability flags so moderators can triage multi-delta sessions faster.
- Added cadence override endpoint and admin strip controls so moderators can defer lore batches within DES-16 limits while session memory updates cadence state immediately.
- Persisted moderation queue snapshots and publishing cadence schedules to PostgreSQL (`moderation_queue_state`, `publishing_cadence_state`) with automatic hydration on server startup when `MODERATION_DATABASE_URL` is configured.
- Instrumented the Temporal moderation bridge with exponential backoff, retry telemetry (`telemetry.moderation.temporal.*` events), and final-failure alerts so ops dashboards surface transport health alongside cadence snapshots.

## Code Surfaces
| Path | Purpose |
| --- | --- |
| `src/offline/moderation/moderationQueue.js` | Builds moderation queue state from generated deltas and cadence schedules. |
| `src/offline/publishing/publishingCoordinator.js` | Tracks moderation queue status alongside publishing prep, updating cadence history before/after approvals. |
| `src/offline/publishing/publishingCadence.js` | Stores moderation status metadata (pending counts, reasons, decision IDs) in cadence state history. |
| `src/memory/sessionMemory.js` | Persists moderation queue, exposes aggregation/list helpers, and records pending counts for offline workflow runs. |
| `src/moderation/moderationService.js` | Updates queue entries on decisions, returns cadence overview payloads for admin surfaces. |
| `src/server/routes/moderation.js` | Serves `/admin/moderation/cadence` API. |
| `client/src/components/ModerationCadenceStrip.jsx` | Admin UI strip displaying moderation backlog timers and direct review controls. |
| `client/src/components/ModerationDashboard.jsx` | Integrates cadence strip, fetch pipeline, and session focus callbacks. |
| `src/offline/moderation/temporalModerationBridge.js` | Subscribes to persisted queue updates and relays cadence snapshots to Temporal moderation workflows. |
| `src/offline/moderation/httpTemporalModerationClient.js` | HTTP client that posts queue snapshots to the Temporal endpoint with shared transport credentials. |

## Verification
- `npm test -- --runInBand`
- Playwright: `npx playwright test tests/e2e/admin-moderation.spec.js`

## Follow-Ups
1. Coordinate with ops to validate the new Temporal transport telemetry on staging dashboards once credentials are restored.
