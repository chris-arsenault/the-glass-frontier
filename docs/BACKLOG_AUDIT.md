# Backlog Audit – Session 141

Date: 2025-11-05

Focus: Cycle 10 grooming to concentrate Tier 1 effort on gameplay loops, offline publishing, and the unified client while keeping admin work staged behind core delivery.

## IMP-GM: Narrative Engine & Check Runner

| Item | Status | Priority | Owner | Notes / Next Step |
|------|--------|----------|-------|-------------------|
| IMP-GM-07: Memory Stress Harness & Transparent Check Narration | todo | P1 | codex | Draft multi-session stress scenarios, extend check telemetry for transparent narration, and capture initial harness artefacts for cadence tuning. |

## IMP-HUBS: Hub Implementation & Load Readiness

| Item | Status | Priority | Owner | Notes / Next Step |
|------|--------|----------|-------|-------------------|
| IMP-HUBS-05: Hub PvP Contested Interactions | in-progress | P1 | codex | Monitor cooldown sentiment, validate Temporal payload timing across two releases, and lock telemetry before closing. |
| IMP-HUBS-06: Contest Fallout Quest Hooks | todo | P1 | codex | Use contest telemetry to design follow-up quest verbs, route fallout through offline pipeline handshakes, and prep documentation. |

## IMP-OFFLINE: Post-Session Publishing Pipeline

| Item | Status | Priority | Owner | Notes / Next Step |
|------|--------|----------|-------|-------------------|
| IMP-OFFLINE-06: Contest Delta Integration & Conflict Review | todo | P1 | codex | Define contested telemetry contract, prototype conflict detection, and dry-run review gating on tag 7 artefacts. |

## IMP-CLIENT: Unified Web Client Shell

| Item | Status | Priority | Owner | Notes / Next Step |
|------|--------|----------|-------|-------------------|
| IMP-CLIENT-07: Contest & Publishing Overlays Unification | todo | P1 | codex | Design unified overlay layout, hook into contest/publishing endpoints, and collect SME feedback before build. |

## IMP-MOD: Moderation & Admin Surfaces

| Item | Status | Priority | Owner | Notes / Next Step |
|------|--------|----------|-------|-------------------|
| IMP-MOD-02: Prohibited Capability Registry & Policy Editor | todo | P2 | codex | Stage schema + admin UX once Tier 1 funnels stabilize; remains queued behind gameplay deliverables. |

## Delivered / Deferred Features

- IMP-PLATFORM: Platform Implementation Foundations — delivered; platform automation resumes only when gameplay requires it.

### WIP + Compliance Checks

- Active WIP (`in-progress`): 1 (IMP-HUBS-05), within the WIP ≤ 10 threshold.
- All open PBIs are linked to their owning features; no orphan backlog items detected.
- Tier 1 coverage spans GM engine transparency, hub loops, offline publishing, and the unified client per `REQUIREMENTS.md`.
- Tier 2 work limited to moderation governance; Tier 3 platform tasks remain paused.
