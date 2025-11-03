# Backlog Audit – Session 31 Grooming
Updated: 2025-11-03

## Active Implementation Features

### IMP-GM: Narrative Engine & Check Runner *(status: in-progress)*
| Item | Status | Priority | Dependencies | Notes |
|------|--------|----------|--------------|-------|
| `IMP-GM-01: LangGraph Narrative Engine Skeleton` | todo | P1 | `IMP-IAC-01` | Bootstraps LangGraph flow, freeform intent intake, and check dispatch per DES-11/12/13. |
| `IMP-GM-02: Temporal Check Runner & Momentum Engine` | todo | P1 | `IMP-GM-01`, `IMP-IAC-01` | Implements deterministic check workflows, momentum economy, and safety veto hooks. |
| `IMP-GM-03: Session Memory & Character Facade` | todo | P1 | `IMP-IAC-01` | Provides hard context shards (character sheet, inventory, momentum) with moderation-aware APIs. |

### IMP-OFFLINE: Post-Session Publishing Pipeline *(status: in-progress)*
| Item | Status | Priority | Dependencies | Notes |
|------|--------|----------|--------------|-------|
| `IMP-OFFLINE-01: Story Consolidation Workflow MVP` | todo | P1 | `IMP-IAC-01`, `IMP-GM-01` | Runs Temporal workflow that summarizes transcripts into player/admin recaps. |
| `IMP-OFFLINE-02: Entity Extraction & Delta Queue` | todo | P1 | `IMP-OFFLINE-01`, `IMP-GM-03` | Builds spaCy-based entity extraction and immutable world delta proposals. |
| `IMP-OFFLINE-03: Publishing Cadence & Search Sync` | todo | P1 | `IMP-OFFLINE-02`, `IMP-SEARCH-01` | Applies approved deltas, drives cadence scheduler, and maintains search freshness. |

### IMP-CLIENT: Unified Web Client Shell *(status: in-progress)*
| Item | Status | Priority | Dependencies | Notes |
|------|--------|----------|--------------|-------|
| `IMP-CLIENT-01: Web Client Shell & Chat Canvas` | todo | P1 | `IMP-GM-01` | Establishes chat-first React shell with session transport hookups and accessibility scaffolding. |
| `IMP-CLIENT-02: Overlay System & Pacing Ribbon` | todo | P1 | `IMP-CLIENT-01`, `IMP-GM-02`, `IMP-GM-03` | Delivers check disclosure overlays, pacing ribbon, and character sheet bindings. |
| `IMP-CLIENT-03: Service Worker & Offline Continuity` | todo | P1 | `IMP-CLIENT-01`, `IMP-AXE-01` | Implements service worker, IndexedDB caching, and offline intent queueing. |
| `IMP-AXE-01: Accessibility Automation Pipeline` | todo | P1 | `IMP-CLIENT-01` | Adds axe-core + Playwright automation for accessibility regression coverage. |

### IMP-HUBS: Hub Implementation & Load Readiness *(status: in-progress)*
| Item | Status | Priority | Dependencies | Notes |
|------|--------|----------|--------------|-------|
| `IMP-HUB-01: Hub Gateway & Command Parser Skeleton` | todo | P1 | `IMP-IAC-01` | Creates uWebSockets gateway, verb DSL, and baseline telemetry for hub verbs. |
| `IMP-HUB-02: Hub Orchestrator & Temporal Hooks` | todo | P1 | `IMP-HUB-01`, `IMP-IAC-01` | Implements Redis-backed presence, replay logs, and Temporal escalation workflows. |
| `IMP-HUB-03: Hub Narrative Bridge & Safety Telemetry` | todo | P1 | `IMP-HUB-02`, `IMP-OFFLINE-02`, `IMP-MOD-01` | Connects hubs to LangGraph, enforces capability checks, and emits moderation telemetry. |

### IMP-PLATFORM: Platform Implementation Foundations *(status: in-progress)*
| Item | Status | Priority | Dependencies | Notes |
|------|--------|----------|--------------|-------|
| `IMP-IAC-01: Nomad & Vault Operations Modules` | todo | P1 | `DES-19` IaC baseline | Terraform/Nomad + Vault automation for core services and secrets. |
| `IMP-OBS-01: Observability & Incident Dashboards` | todo | P1 | `IMP-IAC-01`, `IMP-HUB-02`, `IMP-OFFLINE-02` | Deploys OTEL collectors, VictoriaMetrics, Loki, Grafana dashboards, and alerting. |
| `IMP-MINIO-01: MinIO Lifecycle Automation` | todo | P2 | `IMP-IAC-01` | Enforces retention tiers, lifecycle rules, and telemetry for lore assets. |
| `IMP-SEARCH-01: Lore Search Differential Indexing` | todo | P2 | `IMP-IAC-01` | Builds incremental indexing jobs and drift monitoring for self-hosted search. |

### IMP-MOD: Moderation & Admin Surfaces *(status: in-progress)*
| Item | Status | Priority | Dependencies | Notes |
|------|--------|----------|--------------|-------|
| `IMP-MOD-01: Moderation Dashboard & Live Overrides` | todo | P1 | `IMP-CLIENT-02`, `IMP-OFFLINE-02` | Admin console for alert triage, override actions, and audit logging. |
| `IMP-MOD-02: Prohibited Capability Registry & Policy Editor` | todo | P2 | `IMP-MOD-01`, `IMP-GM-03` | CRUD tooling for capability registry, role assignments, and sync events. |
| `IMP-MOD-03: Moderation Queue & Publishing Sync` | todo | P1 | `IMP-MOD-01`, `IMP-OFFLINE-02`, `IMP-OFFLINE-03` | Binds moderation SLA timers to publishing cadence to block unsafe releases. |

## Delivered Discovery Features
- `RES-CORE: Foundational Research` – delivered (sessions 1–10 research archived in `docs/research` and MCP cache).
- `DES-CORE: Foundational Design` – delivered (SYSTEM_DESIGN_SPEC and design artefacts complete).
- `NAR-CORE: Worldbuilding Foundations` – delivered (WORLD_BIBLE complete; follow-ups tracked in implementation features).

## Compliance Notes
- All active backlog items are linked to implementation features; no orphan PBIs remain.
- WIP limit respected (0 items in progress); next sessions will pull from P1 priorities above.
- Moderation hooks, offline cadence, and accessibility requirements are captured across IMP-GM, IMP-OFFLINE, IMP-CLIENT, and IMP-MOD features, aligning with REQUIREMENTS.md mandates.
