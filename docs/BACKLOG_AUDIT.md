# Backlog Audit – Session 121

Generated: 2025-11-05

## Feature Overview

| Feature | Status | Priority | Owner | Notes |
|---------|--------|----------|-------|-------|
| IMP-OFFLINE: Post-Session Publishing Pipeline | in-progress | 4 | codex | Stage deploy shortcut restored; IMP-OFFLINE-05 queued to replay staging QA, capture drift telemetry, and publish lore bundles for admin review. |
| IMP-HUBS: Hub Implementation & Load Readiness | in-progress | 5 | codex | Contested PvP telemetry ready for staging reruns; IMP-HUBS-05 will validate live Temporal workflows and moderation hooks post-deploy. |
| IMP-CLIENT: Unified Web Client Shell | in-progress | 6 | codex | IMP-CLIENT-06 awaiting refreshed LangGraph SSE + admin alert artefacts plus SME confirmation after the next stage deploy. |
| IMP-PLATFORM: Platform Implementation Foundations | in-progress | 7 | codex | IMP-PLATFORM-03 owns the next stage deploy; downstream MinIO/Search/Observability work parked behind Tier 1 closures. |
| IMP-MOD: Moderation & Admin Surfaces | in-progress | 8 | codex | Moderation queue integration depends on pipeline + hub staging runs; policy editor remains queued behind Tier 1 outcomes. |

## Feature Details

### IMP-OFFLINE: Post-Session Publishing Pipeline

| Backlog Item | Status | Priority | Notes |
|--------------|--------|----------|-------|
| IMP-OFFLINE-05: Publishing Pipeline QA & Lore Sync | todo | P1 | Stage deploy run will unblock end-to-end QA; add drift telemetry + lore bundles to unblock IMP-CLIENT-06 and IMP-MOD-03 reviews. |

### IMP-HUBS: Hub Implementation & Load Readiness

| Backlog Item | Status | Priority | Notes |
|--------------|--------|----------|-------|
| IMP-HUBS-05: Hub PvP Contested Interactions | todo | P1 | Stage contest monitor rerun + moderation SME feedback required to close PvP balancing guidance. |

### IMP-CLIENT: Unified Web Client Shell

| Backlog Item | Status | Priority | Notes |
|--------------|--------|----------|-------|
| IMP-CLIENT-06: Narrative Overlay & Pipeline Status Integration | todo | P1 | Needs latest stage smoke + alert artefacts and SME signoff linking overlays with offline pipeline telemetry. |

### IMP-PLATFORM: Platform Implementation Foundations

| Backlog Item | Status | Priority | Notes |
|--------------|--------|----------|-------|
| IMP-PLATFORM-03: Image management | in-progress | P0 | Execute `npm run deploy:stage`, verify Nomad allocations, and broadcast manifest links to gameplay/pipeline owners. |
| IMP-MINIO-01: MinIO Lifecycle Automation | todo | P2 | Schedule after Tier 1 validations so lifecycle rehearsal can piggyback on the same stage deploy window. |
| IMP-SEARCH-01: Lore Search Differential Indexing | todo | P2 | Kick off once publishing QA proves stable delta feeds and retry telemetry. |
| IMP-OBS-01: Observability & Incident Dashboards | todo | P3 | Hold until gameplay/offline/client loops are validated and generating sustained telemetry. |

### IMP-MOD: Moderation & Admin Surfaces

| Backlog Item | Status | Priority | Notes |
|--------------|--------|----------|-------|
| IMP-MOD-02: Prohibited Capability Registry & Policy Editor | todo | P2 | Start after IMP-OFFLINE-05 / IMP-HUBS-05 finalize so capability events target stable pipelines. |
| IMP-MOD-03: Moderation Queue & Publishing Sync | in-progress | P1 | Share staging deploy + QA telemetry with ops dashboards to finalize cadence strip validation. |

## Sanity Checks

- All active backlog items remain linked to features; no orphan PBIs detected.
- Active WIP (in-progress): 2 items, within the WIP ≤ 10 guideline.
- Tier 1 focus locks on gameplay loops, offline publishing, and unified client deliverables per REQUIREMENTS.md.
