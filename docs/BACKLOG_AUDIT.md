# Backlog Audit – Session 41 (Implementation Grooming)

## Active Implementation Features

| Feature | Priority | Status | Backlog Items |
|---------|----------|--------|---------------|
| IMP-GM: Narrative Engine & Check Runner | P3 | in-progress | - `IMP-GM-01` done (P1) – LangGraph narrative engine skeleton<br>- `IMP-GM-02` done (P1) – Temporal check runner & momentum engine<br>- `IMP-GM-03` done (P1) – Session memory & character facade<br>- `IMP-GM-04` todo (P1) – LangGraph narrative nodes & tool harness |
| IMP-OFFLINE: Post-Session Publishing Pipeline | P4 | in-progress | - `IMP-OFFLINE-01` todo (P1) – Story consolidation workflow MVP<br>- `IMP-OFFLINE-02` done (P1) – Entity extraction & delta queue<br>- `IMP-OFFLINE-03` todo (P1) – Publishing cadence & search sync |
| IMP-HUBS: Hub Implementation & Load Readiness | P5 | in-progress | - `IMP-HUB-01` done (P1) – Hub gateway & command parser skeleton<br>- `IMP-HUB-02` todo (P1) – Hub orchestrator & Temporal hooks<br>- `IMP-HUB-03` todo (P1) – Hub narrative bridge & safety telemetry<br>- `IMP-HUB-04` todo (P1) – Verb catalog persistence & admin controls |
| IMP-CLIENT: Unified Web Client Shell | P6 | in-progress | - `IMP-CLIENT-01` done (P1) – Web client shell & chat canvas<br>- `IMP-CLIENT-02` done (P1) – Overlay system & pacing ribbon<br>- `IMP-CLIENT-03` done (P1) – Service worker & offline continuity<br>- `IMP-AXE-01` done (P1) – Accessibility automation pipeline<br>- `IMP-CLIENT-04` todo (P1) – Account & session management UI |
| IMP-MOD: Moderation & Admin Surfaces | P7 | in-progress | - `IMP-MOD-01` todo (P2) – Moderation dashboard & live overrides<br>- `IMP-MOD-02` todo (P2) – Prohibited capability registry & policy editor<br>- `IMP-MOD-03` todo (P2) – Moderation queue & publishing sync |
| IMP-PLATFORM: Platform Implementation Foundations | P8 | in-progress | - `IMP-IAC-01` todo (P2) – Nomad & Vault operations modules<br>- `IMP-OBS-01` todo (P3) – Observability & incident dashboards<br>- `IMP-MINIO-01` todo (P2) – MinIO lifecycle automation<br>- `IMP-SEARCH-01` todo (P2) – Lore search differential indexing |

## Delivered Epics (For Reference)

| Feature | Priority | Status |
|---------|----------|--------|
| RES-CORE: Foundational Research | P1 | delivered |
| DES-CORE: Foundational Design | P2 | delivered |
| NAR-CORE: Worldbuilding Foundations | P9 | delivered |

## WIP & Grooming Notes

- All backlog items now linked to their owning features; no orphaned PBIs remain.
- WIP limit respected: no items are marked in-progress/blocked outside the current focus.
- Priorities realigned to emphasize Tier 1 delivery (gameplay engine, offline pipeline, hub loops, unified client) while deferring platform observability to Tier 3.
