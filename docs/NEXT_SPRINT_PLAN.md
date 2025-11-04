# Next Sprint Plan – Sessions 111–120

Generated: 2025-11-04

| Priority | Tier | Focus Area | Key Backlog Items | Immediate Actions | Dependencies / Notes |
|----------|------|------------|-------------------|-------------------|----------------------|
| P1 | Tier 1 | Gameplay loops & offline publishing readiness | IMP-OFFLINE-05, IMP-HUBS-05, IMP-PLATFORM-03 | Clear staging credentials blockade with platform ops; schedule joint rehearsal window to rerun offline QA + contest workflows; once access returns, execute `npm run docker:publish:temporal-worker`, `npm run offline:qa`, and `npm run monitor:contests` to capture SME-ready artefacts. | Requires staging registry, MinIO, Backblaze, and Temporal connectivity; artefacts must satisfy DES-16, DES-17, and DES-BENCH-01 tolerances. |
| P1 | Tier 1a | Unified web client overlays & admin telemetry | IMP-CLIENT-06 | Maintain daily stage smoke + alerts runs; publish metrics to `#client-overlays` and `#admin-sse`; capture overlay screenshots/logs once offline telemetry replays land to secure SME approvals. | Depends on IMP-OFFLINE-05 delivering retry telemetry and IMP-HUBS-05 supplying contest feeds. |
| P2 | Tier 2 | Moderation & lore surfacing enablement | IMP-MOD-01, IMP-MOD-02, IMP-MOD-03, IMP-SEARCH-01 | Finalise UX specs and API scaffolding so implementation can begin immediately after Tier 1 unblock; outline data contracts tying moderation queue + search drift to publishing cadence. | Kick off once Tier 1 deliverables demonstrate stable telemetry and retry pipelines; ensure alignment with REQUIREMENTS.md moderation mandates. |
| P3 | Tier 3 | Platform hardening & observability | IMP-MINIO-01, IMP-OBS-01 | Track credential restoration; prep rehearsal checklists for lifecycle automation and observability rollout while Tier 1 stabilises. | Resume only after Tier 1 systems deliver consistent artefacts; keep ops stakeholders informed via docs/plans/backlog.md updates. |

## Supporting Notes

- Maintain WIP discipline: keep only the Tier 1/Tier 1a items active until staging access is restored and validations complete.
- Validate every Tier 1 milestone with updated documentation (`docs/plans/backlog.md`, session reports) and artefact links for SME review.
- Confirm alignment with REQUIREMENTS.md for offline publishing, unified web client, and moderation control surfaces before promoting Tier 2 work.
