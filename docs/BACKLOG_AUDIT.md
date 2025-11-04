# Backlog Audit – Session 111

Generated: 2025-11-04

## Feature Overview

| Feature | Status | Priority | Owner | Notes |
|---------|--------|----------|-------|-------|
| IMP-OFFLINE: Post-Session Publishing Pipeline | blocked | 4 | codex | Drift-sim QA refreshed (2025-11-04T10:13Z); staging MinIO/Backblaze credentials still required for end-to-end rehearsal (IMP-OFFLINE-05). |
| IMP-HUBS: Hub Implementation & Load Readiness | blocked | 5 | codex | Contest telemetry summary updated (contest-monitor-summary-2025-11-04T10-17-19Z.json); pending live staging verification (IMP-HUBS-05). |
| IMP-CLIENT: Unified Web Client Shell | blocked | 6 | codex | Stage smoke (2025-11-04T10:12Z) healthy; SME approval still outstanding for overlay/pipeline telemetry (IMP-CLIENT-06). |
| IMP-PLATFORM: Platform Implementation Foundations | blocked | 7 | codex | P0 image management now blocked awaiting staging registry credentials; downstream platform hardening deferred until Tier 1 clears. |
| IMP-MOD: Moderation & Admin Surfaces | todo | 8 | codex | Moderation tooling queued behind Tier 1 loop readiness. |

## Feature Details

### IMP-OFFLINE: Post-Session Publishing Pipeline

| Backlog Item | Status | Priority | Notes |
|--------------|--------|----------|-------|
| IMP-OFFLINE-05: Publishing Pipeline QA & Lore Sync | blocked | P1 | Drift simulation rerun at 2025-11-04T10:13Z (rollup refreshed); staging credentials still needed for storage + overlay evidence. |

### IMP-HUBS: Hub Implementation & Load Readiness

| Backlog Item | Status | Priority | Notes |
|--------------|--------|----------|-------|
| IMP-HUBS-05: Hub PvP Contested Interactions | blocked | P1 | CLI summary regenerated (contest-monitor-summary-2025-11-04T10-17-19Z.json); awaiting live staging contest telemetry and SME review. |

### IMP-CLIENT: Unified Web Client Shell

| Backlog Item | Status | Priority | Notes |
|--------------|--------|----------|-------|
| IMP-CLIENT-06: Narrative Overlay & Pipeline Status Integration | blocked | P1 | Latest stage smoke (2025-11-04T10:12Z) delivers 5 ms overlay/4 ms offline queue metrics; SME confirmation still pending. |

### IMP-PLATFORM: Platform Implementation Foundations

| Backlog Item | Status | Priority | Notes |
|--------------|--------|----------|-------|
| IMP-PLATFORM-03: Image management | blocked | P0 | Temporal worker publish helper and multi-service Docker pipeline ready; blocked on staging registry credentials to execute CI rehearsal. |
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
- Active WIP (blocked + in-progress): 5 items, within the WIP ≤ 10 guideline.
- Tier 1 focus stays on gameplay loops, offline publishing, and unified client deliverables per REQUIREMENTS.md.
