# Backlog Audit – Session 80 Grooming

Generated: 2025-11-03

## Feature Summary

| Feature | Priority | Status | Owner | Open PBIs |
|---------|----------|--------|-------|-----------|
| IMP-GM: Narrative Engine & Check Runner | 3 | in-progress | codex | 1 |
| IMP-OFFLINE: Post-Session Publishing Pipeline | 4 | in-progress | codex | 1 |
| IMP-HUBS: Hub Implementation & Load Readiness | 5 | in-progress | codex | 1 |
| IMP-CLIENT: Unified Web Client Shell | 6 | blocked | codex | 1 |
| IMP-PLATFORM: Platform Implementation Foundations | 7 | in-progress | codex | 3 |
| IMP-MOD: Moderation & Admin Surfaces | 8 | todo | codex | 3 |
| RES-CORE: Foundational Research | 1 | delivered | — | 0 |
| DES-CORE: Foundational Design | 2 | delivered | — | 0 |
| NAR-CORE: Worldbuilding Foundations | 9 | delivered | codex | 0 |

- WIP (in-progress + blocked): 3 / 10 limit.

## Backlog Detail

### IMP-GM: Narrative Engine & Check Runner
- `IMP-GM-06: Live Session Vertical Slice & Transcript Export` — `in-progress`, `P1` — Validate the vertical slice against live LangGraph backends, capture QA feedback, and export the approved transcript artifacts to feed IMP-OFFLINE-05.
- Closed prior to this audit: `IMP-GM-01` through `IMP-GM-05` (`done`).

### IMP-OFFLINE: Post-Session Publishing Pipeline
- `IMP-OFFLINE-05: Publishing Pipeline QA & Lore Sync` — `todo`, `P1` — Run publishing QA using the IMP-GM-06 transcript, confirm entity extraction moderation metadata, and document rollback behaviour.
- Closed prior to this audit: `IMP-OFFLINE-01` through `IMP-OFFLINE-04` (`done`).

### IMP-HUBS: Hub Implementation & Load Readiness
- `IMP-HUBS-05: Hub PvP Contested Interactions` — `todo`, `P2` — Extend orchestrator support for contested encounters, wiring moderation alerts and momentum hooks from the check runner.
- Closed prior to this audit: `IMP-HUB-01` through `IMP-HUB-04` (`done`).

### IMP-CLIENT: Unified Web Client Shell
- `IMP-CLIENT-06: Narrative Overlay & Pipeline Status Integration` — `blocked`, `P1` — Await SME validation and live staging admin-alert telemetry before finalising overlay/pipeline disclosure surfaces; continue logging outputs in `docs/reports/stage-sse-distribution-2025-11-04.md`.
- Closed prior to this audit: `IMP-CLIENT-01` through `IMP-CLIENT-05`, `IMP-AXE-01` (`done`).

### IMP-PLATFORM: Platform Implementation Foundations
- `IMP-MINIO-01: MinIO Lifecycle Automation` — `blocked`, `P2` — Lifecycle automation scripts landed; blocked on staged MinIO credentials and Backblaze rehearsal before dashboards can be validated.
- `IMP-SEARCH-01: Lore Search Differential Indexing` — `todo`, `P2` — Differential indexing pipeline and fallback search strategy remain queued behind Tier 1 gameplay deliverables.
- `IMP-OBS-01: Observability & Incident Dashboards` — `todo`, `P3` — Observability stack deferred until after gameplay/client priorities close.
- Closed prior to this audit: `IMP-IAC-01`, `IMP-PLATFORM-02` (`done`).

### IMP-MOD: Moderation & Admin Surfaces
- `IMP-MOD-01: Moderation Dashboard & Live Overrides` — `todo`, `P2` — Build admin triage console for `admin.alert` processing and override actions.
- `IMP-MOD-02: Prohibited Capability Registry & Policy Editor` — `todo`, `P2` — Deliver capability governance editor with event propagation and audit trails.
- `IMP-MOD-03: Moderation Queue & Publishing Sync` — `todo`, `P2` — Enforce publishing cadence gates tied to moderation queue status.

### Delivered Phases
- Research (`RES-CORE`), Design (`DES-CORE`), and Narrative (`NAR-CORE`) feature backlogs remain closed; no orphaned items identified.
