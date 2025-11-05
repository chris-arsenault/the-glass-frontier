# Backlog Snapshot

Updated for Session 134 directive cycle. Tier 1 focus now locks exclusively onto core gameplay delivery; all CI, review, artefact, and automation side-process workstreams are permanently retired.

## Tier 0 (P0)
| Feature | Item | Status | Priority | Notes |
|---------|------|--------|----------|-------|
| IMP-PLATFORM: Platform Implementation Foundations | IMP-PLATFORM-03: Image management | done | P0 | Closed 2025-11-05 without further work. All Tier 1 reminder automation, staging credential rehearsal, and CI shortcut tasks are sunset under the no-side-process policy. |

## Tier 1 (P1)
| Feature | Item | Status | Priority | Notes |
|---------|------|--------|----------|-------|
| IMP-OFFLINE: Post-Session Publishing Pipeline | IMP-OFFLINE-05: Publishing Pipeline QA & Lore Sync | done | P1 | Closed 2025-11-05; publishing QA, cadence alignment, and artefact distribution are out of scope going forward. |
| IMP-CLIENT: Unified Web Client Shell | IMP-CLIENT-06: Narrative Overlay & Pipeline Status Integration | done | P1 | Closed 2025-11-05; staging smoke bundles, drift rollups, and SME coordination halted under the gameplay-only directive. |
| IMP-HUBS: Hub Implementation & Load Readiness | IMP-HUBS-05: Hub PvP Contested Interactions | in-progress | P1 | Cooldown telemetry now emits rematch cooling, block, and sentiment events while Temporal timings are normalised; upcoming work analyses these feeds and pipes sentiment into moderation dashboards before broadening verb coverage. |
| IMP-MOD: Moderation & Admin Surfaces | IMP-MOD-03: Moderation Queue & Publishing Sync | done | P1 | Closed 2025-11-05; moderation cadence telemetry and publishing sync rehearsals are sunset to prioritize gameplay. |

## Tier 2 (P2)
| Feature | Item | Status | Priority | Notes |
|---------|------|--------|----------|-------|
| IMP-PLATFORM: Platform Implementation Foundations | IMP-MINIO-01: MinIO Lifecycle Automation | done | P2 | Closed per gameplay-only directive; storage lifecycle automation will not resume unless a shipped feature depends on it. |
| IMP-PLATFORM: Platform Implementation Foundations | IMP-SEARCH-01: Lore Search Differential Indexing | done | P2 | Closed per gameplay-only directive; lore search indexing automation is deferred indefinitely until core gameplay demands it. |
| IMP-MOD: Moderation & Admin Surfaces | IMP-MOD-01: Moderation Dashboard & Live Overrides | done | P2 | Moderation dashboard shipped with DES-18 role guard, override drawer, and Playwright coverage for alert approval flows (`tests/e2e/admin-moderation.spec.js`). |
| IMP-MOD: Moderation & Admin Surfaces | IMP-MOD-02: Prohibited Capability Registry & Policy Editor | todo | P2 | Prep schema/UX drafts once contested interactions and narrative overlays surface concrete policy gaps; no additional pipeline artefacts required. |

## Tier 3 (P3)
| Feature | Item | Status | Priority | Notes |
|---------|------|--------|----------|-------|
| IMP-PLATFORM: Platform Implementation Foundations | IMP-OBS-01: Observability & Incident Dashboards | done | P3 | Closed indefinitely per gameplay-only directive; observability dashboards will return only when a shipped feature depends on them. |

## Delivered / Closed Features
- RES-CORE: Foundational Research
- DES-CORE: Foundational Design
- IMP-GM: Narrative Engine & Check Runner
- NAR-CORE: Worldbuilding Foundations

## Health Checks
- Active WIP (in-progress): 1 item, within the WIP ≤ 10 limit.
- No orphan PBIs; every backlog item remains linked to its owning feature in MCP.
