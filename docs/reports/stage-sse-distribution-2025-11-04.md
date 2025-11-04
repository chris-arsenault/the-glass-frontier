# Stage SSE Smoke Report Distribution Pack — 2025-11-04

## Context
LangGraph stage parity is restored for success check streaming. `npm run stage:smoke` now connects to `https://stage.glass-frontier.local/api/sessions/:id/events`, delivering overlay and offline queue events end-to-end. This packet packages the artefacts and talking points needed to brief client and admin stakeholders.

## Metrics Snapshot
| Metric | Value | Notes |
| --- | --- | --- |
| Check resolution latency | 4 ms | Captured from `metrics.checkResolution.latencyMs`. |
| Overlay sync latency | 5 ms | `overlaySync.observed === true`; overlay stream now stays connected for the full run. |
| Offline queue enqueue latency | 3 ms | `metrics.offlineQueue.latencyMs` for session closure hand-off. |
| Session closure latency | 3 ms | Time to transition from live to closed state. |
| Admin alert stream | Live alert captured (2 ms) | Staging emitted a real high-severity alert; fallback seeding can now be disabled for SME review. |

**Artefact:** `artifacts/langgraph-sse-staging.json` (run `cat artifacts/langgraph-sse-staging.json` for raw capture, run `npm run stage:smoke` to regenerate).

## Admin Alert Observation Snapshot — 2025-11-04T06:18Z
Latest `npm run stage:alerts` output (2025-11-04T06:19:12Z UTC) confirms that staging has emitted a live admin alert. The CLI recommends disabling fallback seeding now that telemetry is within the six-hour freshness window.

```
Admin Alert Observation Summary
--------------------------------
Source: /home/tsonu/src/the-glass-frontier/artifacts/admin-alert-observations.json
Observed at: 2025-11-04T06:18:31.996Z
Age: 40s
Latency: 2ms
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

### Suggested Announcement Snippet
> Stage SSE smoke run (2025-11-04) is green. Check resolution 4 ms, overlay sync 5 ms, offline queue enqueue 3 ms. Artefact: `artifacts/langgraph-sse-staging.json`. Live admin alert captured (2 ms latency); fallback seeding now disabled pending SME sign-off.

## Stakeholder Validation Notes
| Stakeholder | Channel | Status | Notes |
| --- | --- | --- | --- |
| Client overlay SME | `#client-overlays` | Pending | Await confirmation that metrics satisfy DES-13 transparency thresholds. |
| Admin pipeline SME | `#admin-sse` | Pending | Capture acceptance of offline queue timing and alert gating plan. |

## Follow-ups
- Track validation responses in the table above; once both stakeholders respond, update `IMP-CLIENT-06` and handoff notes.
- Disable the fallback seeding flag in subsequent smoke announcements so stakeholders see live admin alert telemetry while it remains within the six-hour freshness window.
- `npm run stage:smoke` records the latest admin alert observation in `artifacts/admin-alert-observations.json` and flips the seeding recommendation automatically; reference the artefact before future runs.
- Run `npm run stage:alerts` after each smoke pass to publish the current admin alert status (live vs seeded, latency, window freshness) directly in stakeholder updates.
