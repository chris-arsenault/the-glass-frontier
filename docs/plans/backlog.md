# Backlog Snapshot

Updated for Session 114 grooming cycle. Focus stays on Tier 1 gameplay, offline publishing, and unified client delivery; supporting systems follow once those milestones land.

## Tier 0 (P0)
| Feature | Item | Status | Priority | Notes |
|---------|------|--------|----------|-------|
| IMP-PLATFORM: Platform Implementation Foundations | IMP-PLATFORM-03: Image management | in-progress | P0 | Stage registry/Terraform fixes landed; run `npm run deploy:stage` to bump `.buildnum`, push images to `localhost:5000`, apply Terraform, and validate Nomad allocations + service manifest before resuming CI automation work. |

## Tier 1 (P1)
| Feature | Item | Status | Priority | Notes |
|---------|------|--------|----------|-------|
| IMP-OFFLINE: Post-Session Publishing Pipeline | IMP-OFFLINE-05: Publishing Pipeline QA & Lore Sync | todo | P1 | Stage deploy flow restored; after `npm run deploy:stage` completes, rerun staging QA to capture storage writes, rollback notes, and drift telemetry for the admin overlay. |
| IMP-CLIENT: Unified Web Client Shell | IMP-CLIENT-06: Narrative Overlay & Pipeline Status Integration | todo | P1 | Once `npm run deploy:stage` lands, rerun `npm run run:stage-smoke` / `npm run run:stage-alerts`, refresh artefacts, and secure SME confirmations in docs/reports/stage-sse-distribution-2025-11-04.md. |
| IMP-HUBS: Hub Implementation & Load Readiness | IMP-HUBS-05: Hub PvP Contested Interactions | todo | P1 | Stage connectivity unblocked; follow a fresh `npm run deploy:stage` with `npm run monitor:contests` to gather live Temporal telemetry and brief moderation SMEs. |

## Tier 2 (P2)
| Feature | Item | Status | Priority | Notes |
|---------|------|--------|----------|-------|
| IMP-PLATFORM: Platform Implementation Foundations | IMP-MINIO-01: MinIO Lifecycle Automation | todo | P2 | With `npm run deploy:stage` restoring stage secrets and lifecycle job wiring, execute the Nomad rehearsal + Backblaze checks and capture Grafana/alert evidence. |
| IMP-PLATFORM: Platform Implementation Foundations | IMP-SEARCH-01: Lore Search Differential Indexing | todo | P2 | Stand up differential indexing and pg_trgm fallback after publishing QA stabilises delta feeds. |
| IMP-MOD: Moderation & Admin Surfaces | IMP-MOD-01: Moderation Dashboard & Live Overrides | done | P2 | Moderation dashboard shipped with DES-18 role guard, override drawer, and Playwright coverage for alert approval flows (`tests/e2e/admin-moderation.spec.js`). |
| IMP-MOD: Moderation & Admin Surfaces | IMP-MOD-02: Prohibited Capability Registry & Policy Editor | todo | P2 | Implement capability registry CRUD, event emission, and audit trails tied to session memory. |
| IMP-MOD: Moderation & Admin Surfaces | IMP-MOD-03: Moderation Queue & Publishing Sync | in-progress | P1 | Temporal bridge now emits retry/backoff telemetry (`telemetry.moderation.temporal.*`) with exponential backoff; ops validation in staging remains pending. |

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
