# Backlog Audit – Session 91 (Grooming)

## Feature Overview
| Feature | Status | Priority | Owner | Notes |
|---------|--------|----------|-------|-------|
| IMP-OFFLINE: Post-Session Publishing Pipeline | in-progress | 4 | codex | Final QA still underway; staging storage rehearsal blocked on MinIO/Backblaze credentials. |
| IMP-HUBS: Hub Implementation & Load Readiness | in-progress | 5 | codex | Core hub verbs live; contested interactions remain to unlock full loop. |
| IMP-CLIENT: Unified Web Client Shell | blocked | 6 | codex | Awaiting SME sign-off and fresh stage telemetry before closing overlay integration. |
| IMP-PLATFORM: Platform Implementation Foundations | blocked | 7 | codex | Deferred until credentials land and Tier 1 gameplay/client work signs off. |
| IMP-MOD: Moderation & Admin Surfaces | todo | 8 | codex | Work queued behind gameplay, offline pipeline, and web client delivery. |

_Delivered features_: RES-CORE, DES-CORE, IMP-GM, and NAR-CORE remain complete with no open PBIs.

## Open Backlog Items by Feature

### IMP-OFFLINE
- `IMP-OFFLINE-05` (P1, in-progress) — Continue end-to-end publishing QA once storage credentials return, exercise `--simulate-search-drift`, and coordinate with IMP-CLIENT-06 for overlay evidence.

### IMP-HUBS
- `IMP-HUBS-05` (P1, todo) — Implement contested PvP workflows, broadcast results to players, and emit moderation/telemetry hooks ahead of multiplayer go-live.

### IMP-CLIENT
- `IMP-CLIENT-06` (P1, blocked) — Secure SME confirmation in `#client-overlays` and `#admin-sse`, keep stage smoke/alert captures current, and document overlay telemetry once offline QA artifacts refresh.

### IMP-PLATFORM
- `IMP-MINIO-01` (P2, blocked) — Lifecycle rehearsal paused pending stage MinIO/Backblaze credentials.
- `IMP-SEARCH-01` (P2, todo) — Design differential indexing and fallback search flows for lore/news updates.
- `IMP-OBS-01` (P3, todo) — Observability stack installation deferred until Tier 1 deliverables stabilize.

### IMP-MOD
- `IMP-MOD-01` (P2, todo) — Build moderation dashboard and live override controls tied to `admin.alert` stream.
- `IMP-MOD-02` (P2, todo) — Ship prohibited capability registry + policy editor with event emission.
- `IMP-MOD-03` (P2, todo) — Wire moderation queue enforcement into publishing cadence with SLA timers.

## Sanity Checks
- Active WIP items (in-progress/blocked): 3 (`IMP-OFFLINE-05`, `IMP-CLIENT-06`, `IMP-MINIO-01`) — within the WIP ≤ 10 limit.
- No orphaned backlog entries; every PBI remains linked to its owning feature.
- Tier allocations match GROOMING.md: gameplay/offline/client items sit in P1, supporting systems in P2, deferred platform/observability in P3.
