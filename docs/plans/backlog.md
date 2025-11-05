# Backlog Snapshot

Updated for Session 121 grooming cycle. Focus stays on Tier 1 gameplay, offline publishing, and unified client delivery; supporting systems follow once those milestones land.

## Tier 0 (P0)
| Feature | Item | Status | Priority | Notes |
|---------|------|--------|----------|-------|
| IMP-PLATFORM: Platform Implementation Foundations | IMP-PLATFORM-03: Image management | in-progress | P0 | Execute `npm run deploy:stage`, verify Nomad allocations, capture the manifest, and broadcast outcomes to IMP-OFFLINE-05 / IMP-HUBS-05 / IMP-CLIENT-06 before resuming CI automation. |

## Tier 1 (P1)
| Feature | Item | Status | Priority | Notes |
|---------|------|--------|----------|-------|
| IMP-OFFLINE: Post-Session Publishing Pipeline | IMP-OFFLINE-05: Publishing Pipeline QA & Lore Sync | todo | P1 | After the shared stage deploy, replay offline QA with drift simulation enabled and publish artefacts to unblock IMP-CLIENT-06 and IMP-MOD-03 validation. |
| IMP-CLIENT: Unified Web Client Shell | IMP-CLIENT-06: Narrative Overlay & Pipeline Status Integration | todo | P1 | Post-deploy, rerun `npm run run:stage-smoke` / `npm run run:stage-alerts`, refresh artefacts, link drift telemetry, and collect SME confirmations in docs/reports. |
| IMP-HUBS: Hub Implementation & Load Readiness | IMP-HUBS-05: Hub PvP Contested Interactions | todo | P1 | Run `npm run monitor:contests` after the deploy, gather live Temporal telemetry, and package moderation SME feedback for the PvP balancing brief. |

## Tier 2 (P2)
| Feature | Item | Status | Priority | Notes |
|---------|------|--------|----------|-------|
| IMP-PLATFORM: Platform Implementation Foundations | IMP-MINIO-01: MinIO Lifecycle Automation | todo | P2 | Hold until Tier 1 validations land, then schedule the Nomad rehearsal and Backblaze checks during the next shared deploy window. |
| IMP-PLATFORM: Platform Implementation Foundations | IMP-SEARCH-01: Lore Search Differential Indexing | todo | P2 | Begin once publishing QA locks reliable delta feeds and retry telemetry from IMP-OFFLINE-05. |
| IMP-MOD: Moderation & Admin Surfaces | IMP-MOD-01: Moderation Dashboard & Live Overrides | done | P2 | Moderation dashboard shipped with DES-18 role guard, override drawer, and Playwright coverage for alert approval flows (`tests/e2e/admin-moderation.spec.js`). |
| IMP-MOD: Moderation & Admin Surfaces | IMP-MOD-02: Prohibited Capability Registry & Policy Editor | todo | P2 | Prep schema/UX drafts so implementation can start after IMP-OFFLINE-05 and IMP-HUBS-05 finalize staging artefacts. |
| IMP-MOD: Moderation & Admin Surfaces | IMP-MOD-03: Moderation Queue & Publishing Sync | in-progress | P1 | Use the upcoming staging deploy to capture moderation cadence telemetry and close ops dashboard validation. |

## Tier 3 (P3)
| Feature | Item | Status | Priority | Notes |
|---------|------|--------|----------|-------|
| IMP-PLATFORM: Platform Implementation Foundations | IMP-OBS-01: Observability & Incident Dashboards | todo | P3 | Deploy OTEL/VictoriaMetrics/Loki/Grafana stack after Tier 1 systems stabilize. |

## Delivered / Closed Features
- RES-CORE: Foundational Research
- DES-CORE: Foundational Design
- IMP-GM: Narrative Engine & Check Runner
- NAR-CORE: Worldbuilding Foundations

## Health Checks
- Active WIP (in-progress): 2 items, within the WIP ≤ 10 limit.
- No orphan PBIs; every backlog item remains linked to its owning feature in MCP.
