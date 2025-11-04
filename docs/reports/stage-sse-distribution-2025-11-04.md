# Stage SSE Smoke Report Distribution Pack — 2025-11-04

## Context
LangGraph stage parity is restored for success check streaming. `npm run stage:smoke` now connects to `https://stage.glass-frontier.local/api/sessions/:id/events`, delivering overlay and offline queue events end-to-end. This packet packages the artefacts and talking points needed to brief client and admin stakeholders.

## Metrics Snapshot
| Metric | Value | Notes |
| --- | --- | --- |
| Check resolution latency | 4 ms | Captured from `metrics.checkResolution.latencyMs`. |
| Overlay sync latency | 4 ms | `overlaySync.observed === true`; overlay stream now stays connected for the full run. |
| Offline queue enqueue latency | 2 ms | `metrics.offlineQueue.latencyMs` for session closure hand-off. |
| Session closure latency | 3 ms | Time to transition from live to closed state. |
| Admin alert stream | Skipped | Stage lacks representative alerts; harness flag `skipAdminAlert` remains true. |

**Artefact:** `artifacts/langgraph-sse-staging.json` (run `cat artifacts/langgraph-sse-staging.json` for raw capture, run `npm run stage:smoke` to regenerate).

## Distribution Outline
- Share the metrics snapshot and artefact link in `#client-overlays` and `#admin-sse` channels.
- Highlight the restored `/api/sessions/:id/events` connectivity and confirm overlay deltas stream without manual intervention.
- Note that admin alerts remain skipped pending representative traffic and that we will re-enable assertions once staging emits alerts.

### Suggested Announcement Snippet
> Stage SSE smoke run (2025-11-04) is green. Check resolution 4 ms, overlay sync 4 ms, offline queue enqueue 2 ms. Artefact: `artifacts/langgraph-sse-staging.json`. Admin alerts still gated until staging emits sample events; expect a follow-up validation task.

## Stakeholder Validation Notes
| Stakeholder | Channel | Status | Notes |
| --- | --- | --- | --- |
| Client overlay SME | `#client-overlays` | Pending | Await confirmation that metrics satisfy DES-13 transparency thresholds. |
| Admin pipeline SME | `#admin-sse` | Pending | Capture acceptance of offline queue timing and alert gating plan. |

## Follow-ups
- Track validation responses in the table above; once both stakeholders respond, update `IMP-CLIENT-06` and handoff notes.
- Prepare to re-enable admin alert SSE assertions when representative events appear; coordinate with platform telemetry to seed sample alerts.
