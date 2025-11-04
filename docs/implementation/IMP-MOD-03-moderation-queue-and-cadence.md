# IMP-MOD-03 – Moderation Queue & Publishing Sync

**Backlog Anchor:** IMP-MOD-03 (Moderation Queue & Publishing Sync)  
**Feature:** IMP-MOD – Moderation & Admin Surfaces  
**Design References:** DES-16, DES-18, REQUIREMENTS.md, architecture decision `0c1adab0-2d4f-495f-a952-e7cca7a46b45`

## Summary
- Added moderation queue state tracking to `SessionMemoryFacade`, wiring offline closure runs to persistent queue metadata (window timers, cadence schedule, pending delta roster).
- Extended `PublishingCoordinator` and `PublishingCadence` to surface moderation gate status, pending counts, and cadence history so publishing batches remain blocked until approvals land.
- Exposed `/admin/moderation/cadence` endpoint returning session-level cadence summaries consumed by the admin moderation dashboard.
- Implemented `ModerationCadenceStrip` UI showing SLA countdowns, pending delta counts, and quick links to review alerts, ensuring admins see publishing blocks in real time.
- Aggregated cadence data now groups blocking deltas by entity/reason and highlights capability flags so moderators can triage multi-delta sessions faster.

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

## Verification
- `npm test -- --runInBand`
- Playwright: `npx playwright test tests/e2e/admin-moderation.spec.js`

## Follow-Ups
1. Surface cadence overrides directly in UI once cadence override APIs land (link to publishing coordinator overrides).
2. Persist moderation queue/session cadence data to PostgreSQL and expose Temporal workflow hooks when infra credentials unblock platform rollout.
