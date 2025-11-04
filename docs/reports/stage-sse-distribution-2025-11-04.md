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
| Admin alert stream | Pending rerun | Harness now seeds a `debug.seed.admin_alert` fallback when `LANGGRAPH_SMOKE_SEED_ADMIN_ALERT=true`; rerun stage smoke to capture latency once the proxy is up. |

**Artefact:** `artifacts/langgraph-sse-staging.json` (run `cat artifacts/langgraph-sse-staging.json` for raw capture, run `npm run stage:smoke` to regenerate).

## Distribution Outline
- Share the metrics snapshot and artefact link in `#client-overlays` and `#admin-sse` channels.
- Highlight the restored `/api/sessions/:id/events` connectivity and confirm overlay deltas stream without manual intervention.
- Note that admin alert assertions now use a seeded fallback (`LANGGRAPH_SMOKE_SEED_ADMIN_ALERT=true`) until staging emits representative traffic; share ETA for replacing the seed with live alerts.
- Include the `npm run stage:alerts` summary when posting updates so SMEs see whether fallback seeding can retire (script reads `artifacts/admin-alert-observations.json` and calls out if the latest alert was live or seeded).

### Suggested Announcement Snippet
> Stage SSE smoke run (2025-11-04) is green. Check resolution 4 ms, overlay sync 4 ms, offline queue enqueue 2 ms. Artefact: `artifacts/langgraph-sse-staging.json`. Admin alerts still gated until staging emits sample events; expect a follow-up validation task.

## Stakeholder Validation Notes
| Stakeholder | Channel | Status | Notes |
| --- | --- | --- | --- |
| Client overlay SME | `#client-overlays` | Pending | Await confirmation that metrics satisfy DES-13 transparency thresholds. |
| Admin pipeline SME | `#admin-sse` | Pending | Capture acceptance of offline queue timing and alert gating plan. |

## Follow-ups
- Track validation responses in the table above; once both stakeholders respond, update `IMP-CLIENT-06` and handoff notes.
- Stage harness now re-enables admin alert assertions via seeded fallback; coordinate with platform telemetry to source live alert traffic and retire the debug seed once available.
- New automation: `npm run stage:smoke` records the latest admin alert observation in `artifacts/admin-alert-observations.json` and disables fallback seeding once a real alert lands within a six-hour window. Check the artefact before toggling `LANGGRAPH_SMOKE_SEED_ADMIN_ALERT`.
- Run `npm run stage:alerts` after each smoke pass to publish the current admin alert status (live vs seeded, latency, window freshness) directly in stakeholder updates.
