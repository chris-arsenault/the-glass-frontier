# Backlog Audit – Session 101

Generated: 2025-11-04

## Feature Overview

| Feature | Status | Priority | Owner | Notes |
|---------|--------|----------|-------|-------|
| IMP-OFFLINE: Post-Session Publishing Pipeline | blocked | 4 | codex | Waiting on staging MinIO/Backblaze credentials to validate end-to-end QA (IMP-OFFLINE-05). |
| IMP-HUBS: Hub Implementation & Load Readiness | blocked | 5 | codex | Live contest verification stalled until staging connectivity returns (IMP-HUBS-05). |
| IMP-CLIENT: Unified Web Client Shell | blocked | 6 | codex | Overlay + pipeline telemetry integration held for SME approval (IMP-CLIENT-06). |
| IMP-PLATFORM: Platform Implementation Foundations | blocked | 7 | codex | Platform tasks paused until Tier 1 deliverables and staging credentials stabilise. |
| IMP-MOD: Moderation & Admin Surfaces | todo | 8 | codex | Moderation tooling queued behind Tier 1 loop readiness. |

## Feature Details

### IMP-OFFLINE: Post-Session Publishing Pipeline

| Backlog Item | Status | Priority | Notes |
|--------------|--------|----------|-------|
| IMP-OFFLINE-05: Publishing Pipeline QA & Lore Sync | blocked | P1 | Restore staging credentials, rerun `npm run offline:qa` with drift simulation, and capture admin overlay evidence with IMP-CLIENT-06. |

### IMP-HUBS: Hub Implementation & Load Readiness

| Backlog Item | Status | Priority | Notes |
|--------------|--------|----------|-------|
| IMP-HUBS-05: Hub PvP Contested Interactions | blocked | P1 | Staging rerun of `npm run monitor:contests` required to close DES-BENCH-01 validation and gather SME feedback. |

### IMP-CLIENT: Unified Web Client Shell

| Backlog Item | Status | Priority | Notes |
|--------------|--------|----------|-------|
| IMP-CLIENT-06: Narrative Overlay & Pipeline Status Integration | blocked | P1 | Await SME confirmation and staging telemetry to unlock final overlay release. |

### IMP-PLATFORM: Platform Implementation Foundations

| Backlog Item | Status | Priority | Notes |
|--------------|--------|----------|-------|
| IMP-MINIO-01: MinIO Lifecycle Automation | blocked | P2 | Requires stage credential restoration before rehearsal run. |
| IMP-SEARCH-01: Lore Search Differential Indexing | todo | P2 | Start after publishing QA resumes consistent delta feeds. |
| IMP-OBS-01: Observability & Incident Dashboards | todo | P3 | Defer until Tier 1 systems are ready for telemetry hardening. |

### IMP-MOD: Moderation & Admin Surfaces

| Backlog Item | Status | Priority | Notes |
|--------------|--------|----------|-------|
| IMP-MOD-01: Moderation Dashboard & Live Overrides | todo | P2 | Kickoff once client overlays surface retry telemetry and admin flows. |
| IMP-MOD-02: Prohibited Capability Registry & Policy Editor | todo | P2 | Builds governance tooling for capability lists and sync events. |
| IMP-MOD-03: Moderation Queue & Publishing Sync | todo | P2 | Tie moderation queue SLAs to publishing cadence after IMP-OFFLINE-05 clears. |

## Sanity Checks

- All active backlog items remain linked to features; no orphan PBIs detected.
- Active WIP (blocked + in-progress): 4 items, within the WIP ≤ 10 guideline.
- Tier 1 focus stays on gameplay loops, offline publishing, and unified client deliverables per REQUIREMENTS.md.
