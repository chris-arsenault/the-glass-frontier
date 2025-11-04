# Next Sprint Plan – Sessions 101–110

Generated: 2025-11-04

| Priority | Tier | Focus Area | Key Backlog Items | Immediate Actions | Dependencies / Notes |
|----------|------|------------|-------------------|-------------------|----------------------|
| P1 | Tier 1 | Gameplay implementation (hub contests + offline pipeline) | IMP-HUBS-05, IMP-OFFLINE-05 | Escalate staging connectivity + credential restoration; rerun `npm run monitor:contests` and `npm run offline:qa -- --simulate-search-drift`; distribute telemetry to moderation SMEs. | Requires staging Temporal + storage access; outputs must satisfy DES-BENCH-01 and DES-16. |
| P1 | Tier 1a | Unified web client overlays | IMP-CLIENT-06 | Maintain stage telemetry runs (`npm run stage:smoke`, `npm run stage:alerts`), capture overlay evidence post-staging restore, and secure SME approval in #client-overlays / #admin-sse. | Depends on IMP-OFFLINE-05 drift telemetry and contest data to display retry/alert info. |
| P2 | Tier 2 | Moderation, admin, and lore surfacing systems | IMP-MOD-01, IMP-MOD-02, IMP-MOD-03, IMP-SEARCH-01 | Finalise UX specs, prep API scaffolding, and queue implementation once Tier 1 blockers clear; ensure moderation queue integrations mirror offline cadence outputs. | Unblock after Tier 1 artefacts confirm pipeline + overlay readiness; aligns with REQUIREMENTS.md moderation mandates. |
| P3 | Tier 3 | Platform hardening and observability | IMP-MINIO-01, IMP-OBS-01 | Resume MinIO lifecycle rehearsals and observability stack rollout after staging credentials return and Tier 1 loops stabilise. | Defer until gameplay/client/offline deliverables ship; track credential availability with platform ops. |

## Supporting Notes

- Maintain WIP discipline: keep only the Tier 1/Tier 1a items active until staging access is restored and validations complete.
- Validate every Tier 1 milestone with updated documentation (`docs/plans/backlog.md`, session handoffs) and artefact links for SME review.
- Confirm alignment with REQUIREMENTS.md for offline publishing, unified web client, and moderation control surfaces before promoting Tier 2 work.
