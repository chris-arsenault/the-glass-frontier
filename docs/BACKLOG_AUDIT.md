# Backlog Audit – Session 131

Date: 2025-11-05

Focus: Grooming backlog to keep Tier 1 gameplay, offline publishing, unified web client, and supporting systems aligned with `REQUIREMENTS.md`.

## IMP-PLATFORM: Platform Implementation Foundations

| Item | Status | Priority | Owner | Notes / Next Step |
|------|--------|----------|-------|-------------------|
| IMP-PLATFORM-03: Image management | in-progress | P0 | codex | Fire Tier 1 reminders at 09:00Z/09:05Z, log acknowledgements, then rerun CI rehearsal (`npm run docker:publish:services` + temporal worker). |
| IMP-MINIO-01: MinIO Lifecycle Automation | todo | P2 | codex | Hold until Tier 1 validations complete; prep for Nomad rehearsal + Backblaze checks. |
| IMP-SEARCH-01: Lore Search Differential Indexing | todo | P2 | codex | Start after IMP-OFFLINE-05 locks reliable delta feeds and retry telemetry. |
| IMP-OBS-01: Observability & Incident Dashboards | todo | P3 | codex | Defer until core gameplay + publishing loops stabilize. |
| IMP-PLATFORM-02: LangGraph Staging DNS & Connectivity | done | P1 | codex | Delivered; no further action. |
| IMP-IAC-01: Nomad & Vault Operations Modules | done | P2 | codex | Delivered; no further action. |

## IMP-OFFLINE: Post-Session Publishing Pipeline

| Item | Status | Priority | Owner | Notes / Next Step |
|------|--------|----------|-------|-------------------|
| IMP-OFFLINE-05: Publishing Pipeline QA & Lore Sync | in-progress | P1 | codex | Replay offline QA with tag 7 once Tier 1 acks land, bundle drift rollup + moderation evidence, share with IMP-CLIENT-06. |
| IMP-OFFLINE-04: Closure Triggered Workflow Orchestration | done | P1 | codex | Delivered; no further action. |
| IMP-OFFLINE-03: Publishing Cadence & Search Sync | done | P1 | codex | Delivered; no further action. |
| IMP-OFFLINE-02: Entity Extraction & Delta Queue | done | P1 | codex | Delivered; no further action. |
| IMP-OFFLINE-01: Story Consolidation Workflow MVP | done | P1 | codex | Delivered; no further action. |

## IMP-CLIENT: Unified Web Client Shell

| Item | Status | Priority | Owner | Notes / Next Step |
|------|--------|----------|-------|-------------------|
| IMP-CLIENT-06: Narrative Overlay & Pipeline Status Integration | in-progress | P1 | codex | Distribute 2025-11-05 stage smoke/alert bundle (port 4443) + drift rollup to SMEs, archive approvals, confirm admin alert fallback auto-disables. |
| IMP-CLIENT-05: Session Closure Controls & Offline Status | done | P1 | codex | Delivered; no further action. |
| IMP-CLIENT-04: Account & Session Management UI | done | P1 | codex | Delivered; no further action. |
| IMP-CLIENT-03: Service Worker & Offline Continuity | done | P1 | codex | Delivered; no further action. |
| IMP-CLIENT-02: Overlay System & Pacing Ribbon | done | P1 | codex | Delivered; no further action. |
| IMP-CLIENT-01: Web Client Shell & Chat Canvas | done | P1 | codex | Delivered; no further action. |
| IMP-AXE-01: Accessibility Automation Pipeline | done | P1 | codex | Delivered; no further action. |

## IMP-HUBS: Hub Implementation & Load Readiness

| Item | Status | Priority | Owner | Notes / Next Step |
|------|--------|----------|-------|-------------------|
| IMP-HUBS-05: Hub PvP Contested Interactions | in-progress | P1 | codex | Run staging contest monitor on tag 7, gather >3 actor telemetry, circulate moderation feedback, finalize balancing brief. |
| IMP-HUB-04: Verb Catalog Persistence & Admin Controls | done | P1 | codex | Delivered; no further action. |
| IMP-HUB-03: Hub Narrative Bridge & Safety Telemetry | done | P1 | codex | Delivered; no further action. |
| IMP-HUB-02: Hub Orchestrator & Temporal Hooks | done | P1 | codex | Delivered; no further action. |
| IMP-HUB-01: Hub Gateway & Command Parser Skeleton | done | P1 | codex | Delivered; no further action. |

## IMP-MOD: Moderation & Admin Surfaces

| Item | Status | Priority | Owner | Notes / Next Step |
|------|--------|----------|-------|-------------------|
| IMP-MOD-03: Moderation Queue & Publishing Sync | in-progress | P1 | codex | Shadow tag 7 QA + contest runs, archive moderation cadence evidence, document outstanding gaps for SME review. |
| IMP-MOD-02: Prohibited Capability Registry & Policy Editor | todo | P2 | codex | Begin once pipeline + hubs prove stable; design schema + admin UX ahead of rollout. |
| IMP-MOD-01: Moderation Dashboard & Live Overrides | done | P2 | codex | Delivered; no further action. |

### WIP + Compliance Checks

- Active WIP items (`in-progress`): 5 (within WIP ≤ 10 limit).
- All open PBIs mapped to their owning feature; no orphaned backlog entries detected.
- Tier 1 focus remains on gameplay, offline publishing, unified client, and moderation cadence per `REQUIREMENTS.md`.
