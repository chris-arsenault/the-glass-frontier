# Backlog Snapshot

Updated for Session 141 grooming cycle. Tier 1 emphasis remains on gameplay delivery, offline publishing, and the unified client; side-process and platform automation tracks stay closed.

## Tier 0 (P0)
| Feature | Item | Status | Priority | Notes |
|---------|------|--------|----------|-------|
| — | — | — | — | No Tier 0 items are active; emergency platform work remains sunset. |

## Tier 1 (P1)
| Feature | Item | Status | Priority | Notes |
|---------|------|--------|----------|-------|
| IMP-HUBS: Hub Implementation & Load Readiness | IMP-HUBS-05: Hub PvP Contested Interactions | in-progress | P1 | Monitor cooldown sentiment (<40% negative), validate Temporal payload timing across two releases, then close contested PvP tuning. |
| IMP-HUBS: Hub Implementation & Load Readiness | IMP-HUBS-06: Contest Fallout Quest Hooks | todo | P1 | Design follow-up quest verbs driven by contest telemetry and route fallout through the offline pipeline once IMP-HUBS-05 closes. |
| IMP-OFFLINE: Post-Session Publishing Pipeline | IMP-OFFLINE-06: Contest Delta Integration & Conflict Review | todo | P1 | Ingest contested artefacts, flag conflicting deltas, and gate publishing pending review to honour post-session workflow rules. |
| IMP-CLIENT: Unified Web Client Shell | IMP-CLIENT-07: Contest & Publishing Overlays Unification | todo | P1 | Combine contest timelines and publishing progress in one overlay with SME feedback before implementation. |
| IMP-GM: Narrative Engine & Check Runner | IMP-GM-07: Memory Stress Harness & Transparent Check Narration | todo | P1 | Build multi-session stress harness, expose transparent check narration, and document outputs for auditability. |

## Tier 2 (P2)
| Feature | Item | Status | Priority | Notes |
|---------|------|--------|----------|-------|
| IMP-MOD: Moderation & Admin Surfaces | IMP-MOD-02: Prohibited Capability Registry & Policy Editor | todo | P2 | Queue schema + UX work behind Tier 1 validation so policy hooks reflect contest and publishing evidence. |

## Tier 3 (P3)
| Feature | Item | Status | Priority | Notes |
|---------|------|--------|----------|-------|
| — | — | — | — | No Tier 3 initiatives; observability and automation remain deferred until gameplay requires them. |

## Delivered / Closed Features
- RES-CORE: Foundational Research
- DES-CORE: Foundational Design
- IMP-GM: Narrative Engine & Check Runner (new Cycle 10 work tracked separately via IMP-GM-07)
- IMP-PLATFORM: Platform Implementation Foundations
- NAR-CORE: Worldbuilding Foundations

## Health Checks
- Active WIP (in-progress): 1 item (IMP-HUBS-05), satisfying the WIP ≤ 10 rule.
- All open PBIs remain linked to features; no orphan entries detected.
- Tier 1 backlog now covers GM transparency, hub loops, offline publishing, and unified client mandates from `REQUIREMENTS.md`.
