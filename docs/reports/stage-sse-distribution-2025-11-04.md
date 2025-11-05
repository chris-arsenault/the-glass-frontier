# Stage SSE Smoke Report Distribution Pack — 2025-11-04

## Context
LangGraph stage parity is restored for success check streaming. `npm run stage:smoke` now connects to `https://stage.glass-frontier.local/api/sessions/:id/events`, delivering overlay and offline queue events end-to-end. This packet packages the artefacts and talking points needed to brief client and admin stakeholders.

## 2025-11-05 Refresh — Tag 7 Verification (Fallback Port 4443)
Latest staging smoke run executed via `npm run run:stage-smoke` after stage deploy tag 7. Host port 443 is occupied on the local runner, so the harness automatically rebound the stage proxy on **4443** and updated curl + SSE overrides accordingly.

### Metrics Snapshot — 2025-11-05T04:53Z
| Metric | Value | Notes |
| --- | --- | --- |
| Check resolution latency | 4 ms | `metrics.checkResolution.latencyMs` |
| Overlay sync latency | 4 ms | `metrics.overlaySync.latencyMs` |
| Offline queue enqueue latency | 3 ms | `metrics.offlineQueue.latencyMs` |
| Session closure latency | 3 ms | `metrics.sessionClosure.latencyMs` |
| Admin alert stream | Live alert captured (3 ms) | `metrics.adminAlert.latencyMs`, `seeded: false`; fallback seeding auto-disabled. |

**Artefact:** `artifacts/langgraph-sse-staging.json` (base URL `https://stage.glass-frontier.local:4443/api`).

### Admin Alert Observation Snapshot — 2025-11-05T04:53:28Z
`npm run run:stage-alerts` reflects the refreshed observation inside the six-hour window; SMEs should now review live telemetry without seeded fallbacks.

```
Admin Alert Observation Summary
--------------------------------
Source: /home/tsonu/src/the-glass-frontier/artifacts/admin-alert-observations.json
Observed at: 2025-11-05T04:53:28.025Z
Age: 23s
Latency: 3ms
Seeded fallback: no
Within window (6h 0m): yes

Recommendation: disable fallback seeding
Rationale: Live admin alert observed within the monitoring window. Safe to disable fallback seeding.
Status: ready
```

### Drift Simulation Cross-Link
- Ran `npm run run:offline-qa -- --input artifacts/vertical-slice --simulate-search-drift` against tag 7 assets. Artefact rollup: `artifacts/offline-qa/offline-qa-batch-rollup-2025-11-05T04-53-56-862Z.json`.
- All publishing payloads drained retry telemetry to `status: clear`; `publishing.retryQueue.beforeDrain.pendingCount` and `afterDrain.pendingCount` both report `0` across sessions (see `artifacts/offline-qa/qa-batch-gamma-offline-qa.json` etc.).
- Share the drift rollup alongside the SSE smoke metrics so admin overlays can confirm synchronized retry queue state with IMP-OFFLINE-05.

## Metrics Snapshot — 2025-11-04T10:12Z Baseline
| Metric | Value | Notes |
| --- | --- | --- |
| Check resolution latency | 5 ms | Captured from `metrics.checkResolution.latencyMs` (2025-11-04T10:12Z run). |
| Overlay sync latency | 5 ms | `overlaySync.observed === true`; overlay stream stayed connected for the full run. |
| Offline queue enqueue latency | 4 ms | `metrics.offlineQueue.latencyMs` for session closure hand-off. |
| Session closure latency | 4 ms | Time to transition from live to closed state. |
| Admin alert stream | Live alert captured (3 ms) | Staging emitted a real high-severity alert; fallback seeding can now be disabled for SME review. |

**Artefact:** `artifacts/langgraph-sse-staging.json` (run `cat artifacts/langgraph-sse-staging.json` for raw capture, run `npm run stage:smoke` to regenerate).

## Admin Alert Observation Snapshot — 2025-11-04T10:12Z
Latest `npm run stage:alerts` output (2025-11-04T10:18:33Z UTC) confirms that staging captured a live admin alert during the smoke run. The CLI recommends disabling fallback seeding now that telemetry is within the six-hour freshness window.

```
Admin Alert Observation Summary
--------------------------------
Source: /home/tsonu/src/the-glass-frontier/artifacts/admin-alert-observations.json
Observed at: 2025-11-04T10:12:44.816Z
Age: 5m 49s
Latency: 3ms
Seeded fallback: no
Within window (6h 0m): yes

Recommendation: disable fallback seeding
Rationale: Live admin alert observed within the monitoring window. Safe to disable fallback seeding.
Status: ready
```

## Distribution Outline
- Share the metrics snapshot and artefact link in `#client-overlays` and `#admin-sse` channels.
- Highlight the restored `/api/sessions/:id/events` connectivity and confirm overlay deltas stream without manual intervention.
- Note that staging emitted a high-severity alert during the latest smoke run; fallback seeding can be disabled so SMEs observe live telemetry.
- Include the `npm run stage:alerts` summary when posting updates so SMEs see the live alert details (script reads `artifacts/admin-alert-observations.json` and calls out if the latest alert was live or seeded).
- Call out that the stage proxy rebound to port **4443** due to a local 443 conflict; downstream smoke/alert runners should honour the new base URL until the port frees up.
- Attach the 2025-11-05 drift simulation rollup (`artifacts/offline-qa/offline-qa-batch-rollup-2025-11-05T04-53-56-862Z.json`) to match IMP-OFFLINE-05 telemetry with the overlay status refresh.

### Suggested Announcement Snippet
> Stage SSE smoke run (2025-11-05, proxy rebound to 4443) is green. Check resolution 4 ms, overlay sync 4 ms, offline queue enqueue 3 ms. Artefact: `artifacts/langgraph-sse-staging.json`. Live admin alert captured (3 ms latency); fallback seeding disabled. Drift rollup: `artifacts/offline-qa/offline-qa-batch-rollup-2025-11-05T04-53-56-862Z.json`.

## Stakeholder Validation Notes
| Stakeholder | Channel | Status | Notes |
| --- | --- | --- | --- |
| Client overlay SME | `#client-overlays` | Pending | Share 2025-11-05 latency snapshot (4 ms checks / overlays) and confirm DES-13 thresholds met with fallback port 4443 notice. |
| Admin pipeline SME | `#admin-sse` | Pending | Provide admin alert summary + drift telemetry rollup showing retry queues drained to `status: clear`. |

## Follow-ups
- Track validation responses in the table above; once both stakeholders respond, update `IMP-CLIENT-06` and handoff notes.
- Disable the fallback seeding flag in subsequent smoke announcements so stakeholders see live admin alert telemetry while it remains within the six-hour freshness window.
- `npm run stage:smoke` records the latest admin alert observation in `artifacts/admin-alert-observations.json` and flips the seeding recommendation automatically; reference the artefact before future runs.
- Run `npm run stage:alerts` after each smoke pass to publish the current admin alert status (live vs seeded, latency, window freshness) directly in stakeholder updates.
- Continue pairing smoke runs with `npm run run:offline-qa -- --input artifacts/vertical-slice --simulate-search-drift` so drift telemetry stays aligned (latest rollup: `artifacts/offline-qa/offline-qa-batch-rollup-2025-11-05T04-53-56-862Z.json`).
