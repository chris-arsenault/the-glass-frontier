# Backlog Snapshot

Last updated for Session 31 (implementation grooming kickoff).

## Active Implementation Backlog

| Feature | Item | Status | Priority | Tags | Notes |
|---------|------|--------|----------|------|-------|
| IMP-GM: Narrative Engine & Check Runner | IMP-GM-01: LangGraph Narrative Engine Skeleton | done | P1 | phase:implementation, pillar:gameplay | Stand up LangGraph flow, chat intake, and check dispatch per DES-11/12/13. |
| IMP-GM: Narrative Engine & Check Runner | IMP-GM-02: Temporal Check Runner & Momentum Engine | done | P1 | phase:implementation, pillar:gameplay | Deterministic check runner landed in `src/checkRunner/checkRunner.js`; see `docs/implementation/IMP-GM-02-check-runner.md` for telemetry + follow-ups. |
| IMP-GM: Narrative Engine & Check Runner | IMP-GM-03: Session Memory & Character Facade | todo | P1 | phase:implementation, pillar:gameplay | Hard memory shards for characters/inventory with moderation-aware APIs. |
| IMP-OFFLINE: Post-Session Publishing Pipeline | IMP-OFFLINE-01: Story Consolidation Workflow MVP | todo | P1 | phase:implementation, pillar:pipeline | Temporal workflow to summarize transcripts into player/admin recaps. |
| IMP-OFFLINE: Post-Session Publishing Pipeline | IMP-OFFLINE-02: Entity Extraction & Delta Queue | todo | P1 | phase:implementation, pillar:pipeline | spaCy/heuristic entity pass producing immutable delta proposals. |
| IMP-OFFLINE: Post-Session Publishing Pipeline | IMP-OFFLINE-03: Publishing Cadence & Search Sync | todo | P1 | phase:implementation, pillar:pipeline | Applies approved deltas, schedules releases, keeps search indexes fresh. |
| IMP-CLIENT: Unified Web Client Shell | IMP-CLIENT-01: Web Client Shell & Chat Canvas | done | P1 | phase:implementation, pillar:client | React/Vite shell with chat-first UX, WebSocket/SSE transport, doc: `docs/implementation/IMP-CLIENT-01-client-shell.md`. |
| IMP-CLIENT: Unified Web Client Shell | IMP-CLIENT-02: Overlay System & Pacing Ribbon | todo | P1 | phase:implementation, pillar:client | Check disclosure overlays, pacing ribbon, character sheet bindings. |
| IMP-CLIENT: Unified Web Client Shell | IMP-CLIENT-03: Service Worker & Offline Continuity | todo | P1 | phase:implementation, pillar:client | Service worker + IndexedDB caching + offline intent queueing. |
| IMP-CLIENT: Unified Web Client Shell | IMP-AXE-01: Accessibility Automation Pipeline | todo | P1 | phase:implementation, discipline:qa | axe-core + Playwright automation aligned with DES-12 accessibility hooks. |
| IMP-HUBS: Hub Implementation & Load Readiness | IMP-HUB-01: Hub Gateway & Command Parser Skeleton | todo | P1 | phase:implementation, pillar:multiplayer | uWebSockets gateway, verb DSL, baseline telemetry. |
| IMP-HUBS: Hub Implementation & Load Readiness | IMP-HUB-02: Hub Orchestrator & Temporal Hooks | todo | P1 | phase:implementation, pillar:multiplayer | Redis presence/replay, Temporal escalation workflows. |
| IMP-HUBS: Hub Implementation & Load Readiness | IMP-HUB-03: Hub Narrative Bridge & Safety Telemetry | todo | P1 | phase:implementation, pillar:multiplayer | Hub narration bridge, capability enforcement, moderation telemetry. |
| IMP-PLATFORM: Platform Implementation Foundations | IMP-IAC-01: Nomad & Vault Operations Modules | todo | P1 | phase:implementation, pillar:platform | Terraform/Nomad deployments, Vault policies, secrets automation. |
| IMP-PLATFORM: Platform Implementation Foundations | IMP-OBS-01: Observability & Incident Dashboards | todo | P1 | phase:implementation, pillar:platform | OTEL collectors, VictoriaMetrics/Loki/Grafana dashboards, alerts. |
| IMP-PLATFORM: Platform Implementation Foundations | IMP-MINIO-01: MinIO Lifecycle Automation | todo | P2 | phase:implementation, discipline:storage | Retention tiers and lifecycle rules for lore/hub artefacts. |
| IMP-PLATFORM: Platform Implementation Foundations | IMP-SEARCH-01: Lore Search Differential Indexing | todo | P2 | phase:implementation, discipline:search | Incremental indexing jobs and drift monitoring for self-hosted search. |
| IMP-MOD: Moderation & Admin Surfaces | IMP-MOD-01: Moderation Dashboard & Live Overrides | todo | P1 | phase:implementation, pillar:moderation | Admin console for alert triage, overrides, and audit logging. |
| IMP-MOD: Moderation & Admin Surfaces | IMP-MOD-02: Prohibited Capability Registry & Policy Editor | todo | P2 | phase:implementation, pillar:moderation | Capability registry CRUD, role assignments, sync events. |
| IMP-MOD: Moderation & Admin Surfaces | IMP-MOD-03: Moderation Queue & Publishing Sync | todo | P1 | phase:implementation, pillar:moderation | Moderation SLA timers connected to publishing cadence controls. |

## Delivered Discovery Backlog

| Feature | Item | Status | Priority | Tags | Notes |
|---------|------|--------|----------|------|-------|
| RES-CORE: Foundational Research | RES-01: Narrative & Genre Benchmarking | done | P1 | phase:research, cycle:1 | Findings in `docs/research/session-01-narrative-benchmarking.md`, MCP cache `f842e6b4-7606-400a-81fe-8c86769126fb`. |
| RES-CORE: Foundational Research | RES-02: Extended Narrative Benchmarking | done | P1 | phase:research, cycle:1 | Findings in `docs/research/session-02-extended-narrative-benchmarking.md`, MCP cache `8bb87b27-7d88-4b7c-beb1-5320e9b34bdb`. |
| RES-CORE: Foundational Research | RES-03: Gameplay & System Comparables | done | P1 | phase:research, cycle:1 | Findings in `docs/research/session-03-gameplay-system-comparables.md`, MCP cache `8d888e77-b09b-4c8a-b8b4-126063c82421`. |
| RES-CORE: Foundational Research | RES-04: Automated Check Runner Tradeoffs | done | P1 | phase:research, cycle:1 | Findings in `docs/research/session-04-automated-check-runner-tradeoffs.md`, MCP cache `53f00d71-a60b-4b70-ad63-37126355480c`. |
| RES-CORE: Foundational Research | RES-05: Player Experience & UX Patterns | done | P1 | phase:research, cycle:1 | Findings in `docs/research/session-05-player-experience-ux.md`, MCP cache `783ae922-e057-457c-93d3-2f6609a6e50e`. |
| RES-CORE: Foundational Research | RES-06: Context Dock Resilience & Pacing UX | done | P1 | phase:research, cycle:1 | Findings in `docs/research/session-06-context-dock-resilience.md`, MCP cache `cac74e47-4010-4601-8838-3c45d217a22c`. |
| RES-CORE: Foundational Research | RES-07: Offline Post-Session Pipelines & Moderation | done | P1 | phase:research, cycle:1 | Findings in `docs/research/session-07-offline-pipelines-and-moderation.md`, MCP cache `7b9222b6-b7e4-47d2-be4d-a3372780d89b`. |
| RES-CORE: Foundational Research | RES-08: Story Consolidation & World Delta Integration | done | P1 | phase:research, cycle:1 | Findings in `docs/research/session-08-story-consolidation-world-deltas.md`, MCP cache `93ab540d-5f7a-4076-a16a-2e6fac8792af`. |
| RES-CORE: Foundational Research | RES-09: Technical Landscape Deep Dive | done | P1 | phase:research, cycle:1 | Findings in `docs/research/session-09-technical-landscape.md`, MCP cache `73b3791b-b896-4805-af3e-5c50ae6ad874`. |
| RES-CORE: Foundational Research | RES-10: Market Research Synthesis Brief | done | P0 | phase:research, cycle:1 | Summary in `MARKET_RESEARCH_SUMMARY.md` and `docs/research/session-10-market-research-brief.md`, MCP cache `94a66ac4-9fba-4bf2-9588-4f0d87205fc8`. |
| DES-CORE: Foundational Design | DES-11: Global Systems Map Foundations | done | P1 | phase:design, cycle:1 | Spec in `docs/design/DES-11-global-systems-map.md`, diagram `docs/design/diagrams/DES-11-global-systems-map.mmd`. |
| DES-CORE: Foundational Design | DES-12: Interface Schemas & Accessibility Hooks | done | P1 | phase:design, cycle:1 | Spec in `docs/design/DES-12-interface-schemas.md`, sequence diagram `docs/design/diagrams/DES-12-narrative-check-sequence.mmd`. |
| DES-CORE: Foundational Design | DES-13: Narrative Rules Framework & LLM Hand-Off | done | P1 | phase:design, cycle:2 | Spec in `docs/design/DES-13-rules-framework.md`, diagram `docs/design/diagrams/DES-13-rules-flow.mmd`. |
| DES-CORE: Foundational Design | DES-15: Persistence & Lore Pipeline Blueprint | done | P1 | phase:design, cycle:3 | Spec in `docs/design/DES-15-persistence-lore-pipeline.md`, diagram `docs/design/diagrams/DES-15-persistence-pipeline.mmd`. |
| DES-CORE: Foundational Design | DES-16: Lore Publishing Cadence & Surfaces | done | P1 | phase:design, cycle:3 | Spec in `docs/design/DES-16-lore-publishing-cadence.md`, diagram `docs/design/diagrams/DES-16-publishing-cadence.mmd`. |
| DES-CORE: Foundational Design | DES-17: Multiplayer Hub Real-Time Stack | done | P1 | phase:design, cycle:4 | Spec in `docs/design/DES-17-multiplayer-hub-stack.md`, event flow diagram `docs/design/diagrams/DES-17-hub-event-flow.mmd`. |
| DES-CORE: Foundational Design | DES-18: Admin & Moderation Workflows | done | P1 | phase:design, cycle:4 | Spec in `docs/design/DES-18-admin-moderation-workflows.md`, workflow diagram `docs/design/diagrams/DES-18-moderation-workflow.mmd`. |
| DES-CORE: Foundational Design | DES-20: System Synthesis & SDD Production | done | P1 | phase:design, cycle:5 | `SYSTEM_DESIGN_SPEC.md`, diagram `docs/design/diagrams/DES-20-system-synthesis.mmd`. |
| NAR-CORE: Worldbuilding Foundations | NAR-30: Day-0 World Bible Consolidation | done | P1 | phase:narrative, cycle:6 | `docs/lore/WORLD_BIBLE.md`, MCP narrative `6c329d6f-35d2-42d6-a142-c0b7599aec5a`, lore entry `4e18e698-b85d-4f53-b27c-2940d268a3f0`. |
