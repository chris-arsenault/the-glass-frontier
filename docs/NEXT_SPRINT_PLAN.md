# Next Sprint Plan – Sessions 31–40
Updated: 2025-11-03

| Priority | Focus & Outcomes | Key Backlog Items | Notes |
|----------|-----------------|-------------------|-------|
| P1 | Gameplay implementation: LangGraph GM engine, momentum check runner, and hard memory context online. | `IMP-GM-01`, `IMP-GM-02`, `IMP-GM-03` | Blocks all downstream systems; complete before enabling player-facing loops. |
| P1 | Unified web client & accessibility overlays delivering chat-first play with transparent checks. | `IMP-CLIENT-01`, `IMP-CLIENT-02`, `IMP-CLIENT-03`, `IMP-AXE-01` | Aligns with Tier 1a requirements; collaborate closely with GM engine to validate events. |
| P1 | Offline post-session pipeline for story consolidation, delta proposals, and cadence scheduler. | `IMP-OFFLINE-01`, `IMP-OFFLINE-02`, `IMP-OFFLINE-03` | Enables lore publishing without live-session world writes; depends on GM memory telemetry. |
| P1 | Core hub loop scaffolding (gateway, orchestrator, narrative bridge) to support shared spaces. | `IMP-HUB-01`, `IMP-HUB-02`, `IMP-HUB-03` | Ensure verb DSL + safety hooks mirror Prohibited Capabilities list. |
| P1 | Platform baseline: IaC deployment and observability to host narrative, hub, and pipeline services. | `IMP-IAC-01`, `IMP-OBS-01` | Provide reproducible environments and telemetry before expanding surface area. |
| P1 | Moderation-publishing handshake to keep unsafe deltas from shipping. | `IMP-MOD-03` | Coordinate with offline pipeline to enforce SLA timers and cadence gating. |
| P2 | Moderator tooling & policy governance for manual interventions and capability updates. | `IMP-MOD-01`, `IMP-MOD-02` | Start after GM/UI loops stabilize; required before public release but can trail initial MVP. |
| P2 | Storage and search hardening (retention tiers, differential indexing). | `IMP-MINIO-01`, `IMP-SEARCH-01` | Execute alongside publishing pipeline hardening once core workflows function. |
| P3 | Stretch/benchmarks: performance harnesses, CI orchestration, additional automation. | Future tickets (e.g., `DES-BENCH-01` follow-ups) | Capture as follow-ons if capacity opens; do not preempt Tier 1 execution. |

**Capacity guardrails:** Keep ≤10 items in active execution. Pull from P1 rows first, starting with GM engine + web client pairing, then pipeline and hubs once shared schemas stabilize.
