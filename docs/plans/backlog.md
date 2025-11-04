# Backlog Snapshot

Updated for Session 98 contested telemetry run. Focus stays on Tier 1 gameplay, offline publishing, and unified client delivery; supporting systems follow once those milestones land.

## Tier 1 (P1)
| Feature | Item | Status | Priority | Notes |
|---------|------|--------|----------|-------|
| IMP-OFFLINE: Post-Session Publishing Pipeline | IMP-OFFLINE-05: Publishing Pipeline QA & Lore Sync | in-progress | P1 | Await MinIO/Backblaze credentials to re-run `npm run offline:qa`, capture drift simulation outputs, and export overlay evidence with IMP-CLIENT-06. |
| IMP-CLIENT: Unified Web Client Shell | IMP-CLIENT-06: Narrative Overlay & Pipeline Status Integration | blocked | P1 | SME sign-off pending; keep `npm run stage:smoke` / `npm run stage:alerts` telemetry current and sync with offline QA artifacts. |
| IMP-HUBS: Hub Implementation & Load Readiness | IMP-HUBS-05: Hub PvP Contested Interactions | in-progress | P1 | Load telemetry (2025-11-04T09:32Z) logged four contests; p95 arming 9.2 s and resolution 930 ms breach DES-BENCH-01 budgets—tune contest windows/Temporal pacing and capture follow-up samples. |

## Tier 2 (P2)
| Feature | Item | Status | Priority | Notes |
|---------|------|--------|----------|-------|
| IMP-PLATFORM: Platform Implementation Foundations | IMP-MINIO-01: MinIO Lifecycle Automation | blocked | P2 | Lifecycle rehearsal on hold until stage credentials arrive; resume immediately once secrets land. |
| IMP-PLATFORM: Platform Implementation Foundations | IMP-SEARCH-01: Lore Search Differential Indexing | todo | P2 | Stand up differential indexing and pg_trgm fallback after publishing QA stabilises delta feeds. |
| IMP-MOD: Moderation & Admin Surfaces | IMP-MOD-01: Moderation Dashboard & Live Overrides | in-progress | P2 | Moderation API + dashboard landed (alerts, override drawer, contest telemetry summaries); next align decisions with publishing queue + moderation ops. |
| IMP-MOD: Moderation & Admin Surfaces | IMP-MOD-02: Prohibited Capability Registry & Policy Editor | todo | P2 | Implement capability registry CRUD, event emission, and audit trails tied to session memory. |
| IMP-MOD: Moderation & Admin Surfaces | IMP-MOD-03: Moderation Queue & Publishing Sync | todo | P2 | Enforce moderation queue SLAs inside publishing cadence after IMP-OFFLINE-05 completes. |

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
- Active WIP (blocked + in-progress): 3 items, within the WIP ≤ 10 limit.
- No orphan PBIs; every backlog item remains linked to its owning feature in MCP.
