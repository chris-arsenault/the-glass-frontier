# System Design Specification – *The Glass Frontier*

Backlog anchor: `DES-20`, Feature: `DES-CORE`

## Purpose & Scope
This specification synthesises Sessions 11–19 of the design phase into a cohesive target architecture for *The Glass Frontier*. It integrates the global systems map, interaction contracts, narrative rule frameworks, persistence pipelines, hub networking, moderation workflows, and infrastructure topology into a single reference that will guide implementation planning and backlog refinement. The spec honours the freeform storytelling mandate in `REQUIREMENTS.md`, the session workflow in `AGENTS.md`, and the design intent shift that prioritises narrative breadth over rigid mechanics.

## Design Goals & Constraints
- **Freeform GM Collaboration:** Maintain conversational, GPT-like play with transparent checks and zero mid-session world mutations. (Derived from `REQUIREMENTS.md`, DES-11, DES-13.)
- **Unified Web Interface:** Deliver a fully web-based client that fuses chat, overlays, hubs, lore, and admin workflows while meeting accessibility baselines outlined in DES-12.
- **Post-Session Canon Pipeline:** Route all durable changes through Temporal-driven consolidation, moderation, and publishing (DES-15, DES-16) to protect provenance and conflict resolution simplicity.
- **Self-Hosted Stack:** Operate LangGraph, Temporal, CouchDB, PostgreSQL, Redis, Meilisearch/pg_trgm, and MinIO on self-managed infrastructure within the <$100/mo bootstrap target (DES-19).
- **Safety & Transparency:** Enforce the Prohibited Capabilities List, expose moderation decisions, and preserve tamper-evident audit trails across live and offline workflows (DES-13, DES-18).
- **Scalable Foundations:** Provide clear scaling triggers (DES-19) and benchmarking hooks (DES-BENCH-01) so implementation teams can react to growth without architectural rewrites.

## Integrated Architecture Overview
The system-level relationship diagram lives in `docs/design/diagrams/DES-20-system-synthesis.mmd` and depicts the interaction between live narrative services, hub orchestration, offline pipelines, content surfaces, and operations tooling.

### 1. Live Narrative Loop
- **Narrative Engine:** LangGraph orchestrator seeded with tone bible, naming lexicon, and session memory shards (`DES-11-global-systems-map.md`). It interprets player intents, issues `intent.checkRequest` envelopes, and merges `event.checkResolved` results (`DES-12-interface-schemas.md`).
- **Session Memory & Character Facade:** Provides read/write APIs for structured stats, narrative tags, and prohibited capability references; persists to PostgreSQL with CouchDB replicas for session caching. Memory deltas remain ephemeral until offline reconciliation (`DES-11`, `DES-15`).
- **Check Runner:** Temporal workflows executing success ladders, momentum shifts, and contested move logic (`DES-13-rules-framework.md`, `DES-EDGE-01-contested-move-playbook.md`). Emits telemetry (`telemetry.check.*`) and audit refs for moderation.
- **Telemetry:** All live components stream OpenTelemetry signals into VictoriaMetrics/Loki for latency, queue depth, and safety incident dashboards (`DES-19-infrastructure-scaling-topology.md`).

### 2. Unified Web Client
- **Chat Canvas & Pacing Ribbon:** WebSocket-driven chat with turn markers, wrap prompts (1–3 turns), and check disclosures per DES-11/12.
- **Overlays:** Character sheet, inventory, map, lore/news feed, and admin panes share IndexedDB-backed offline caches with deterministic ARIA hooks documented in DES-12.
- **Service Worker:** Handles SSE fallback, offline transcripts, and queueing of intents while network degraded, aligning to accessibility and narrative continuity requirements.
- **Accessibility Hooks:** WCAG 2.2 AA themes, ARIA-live mapping, keyboard navigation, and automation anchors for axe-core/Playwright harness (`IMP-AXE-01`).

### 3. Multiplayer Hub Stack
- **Hub Gateway:** uWebSockets.js transport with shared auth, rate limiting, and heartbeat support (`DES-17-multiplayer-hub-stack.md`).
- **Command Parser & DSL:** Enforces verb-limited interactions, consults Prohibited Capabilities registry, and emits `hub.command` events.
- **Hub Orchestrator:** Node workers coordinating room state, Redis presence, and contested move escalation to the Narrative Engine and Temporal hub workflows.
- **PvP & Safety Hooks:** Integrates DES-EDGE-01 contested move templates and feeds upcoming `DES-PVP-01` schema; all escalations generate `admin.alert` entries for moderators.

### 4. Offline Post-Session Pipeline
- **Event Capture:** CouchDB stores append-only session, hub, and moderation events with replication into offline processing clusters (DES-15).
- **Story Consolidation:** Temporal workflows summarise transcripts into admin/player recaps with tension markers and unresolved hooks; outputs stored in PostgreSQL + MinIO attachments.
- **Entity Extraction & Delta Determination:** spaCy + custom heuristics to update structured canon, propose deltas, and run safety policy checks (DES-15).
- **Publishing Cadence:** Linked workflows release approved bundles hourly and digest daily, surfacing to lore wiki, news feed, and in-client overlays with transparency notices (DES-16).

### 5. Admin & Moderation Workflows
- **Role Taxonomy:** Admin, Moderator, GM, optional Safety Liaison with least-privilege assignments (`DES-18-admin-moderation-workflows.md`).
- **Live Overrides:** Moderation dashboard processes `admin.alert` events, allowing approvals, amendments, session wraps, and incident escalation while tagging transcripts with `auditRef`.
- **Offline Governance:** Moderate delta queue with 45-minute SLA, escalate backlog warnings, and maintain Prohibited Capabilities registry updates referenced by live services.
- **Transparency Surfaces:** Player UI badges override events, admin console provides provenance chains, and operations dashboards track moderation backlog risk (`telemetry.moderation.*`).

### 6. Infrastructure & Operations
- **Deployment Tiers:** Local (Docker Compose), Integration (Hetzner staging with Tailscale mesh), Production (multi-AZ Hetzner footprint) from DES-19.
- **Edge Layer:** Caddy reverse proxy for TLS termination, static asset delivery, and path routing to API, narrative, and hub services.
- **Compute Plane:** Nomad/systemd-managed Node services, LangGraph workers, Temporal frontends/history, Redis/MinIO clusters with scaling triggers.
- **Observability:** OpenTelemetry collectors funnel metrics/logs to VictoriaMetrics/Loki with Grafana dashboards; Alertmanager drives PagerDuty/webhooks.
- **Secrets & Access:** Vault handles credential distribution, rotation, and policy; zero-trust networking enforced through WireGuard/Tailscale overlays.

### 7. Data Stores & Search
- **PostgreSQL:** Canonical structured data (characters, lore bundles, moderation state, publishing cadence).
- **CouchDB:** Event sourcing for sessions, hub action logs, moderation decisions with replication to offline processors.
- **Redis:** Presence, rate limiting, transient caches for hub state and narrative summarisation.
- **MinIO:** Attachment storage for recaps, daily digests, and asset bundles with lifecycle rules (DES-16 risk notes).
- **Search Layer:** Self-hosted Meilisearch (or pg_trgm fallback) powering lore/news retrieval, observing the “no managed Elasticsearch” mandate.
- **Kafka/Redpanda:** Telemetry/event bus for streaming metrics and narrative instrumentation (DES-11, DES-19).

## Cross-Cutting Concerns
- **Security:** Enforce JWT-authenticated sockets, mutual TLS between services, Vault-backed secret rotation, and immutable audit logs. Admin actions append retcon deltas rather than mutate history.
- **Safety & Moderation:** Prohibited Capabilities registry maintained by admins; command parser, narrative engine, and delta workflows consult the registry synchronously. Safety flags propagate through transcripts, hub logs, and publishing metadata.
- **Accessibility & Inclusion:** Align with DES-12 baseline—keyboard-only navigation, screen-reader roles, theme toggles, motion-reduction support, and automation hooks for axe-core testing.
- **Performance:** Session latency budgets (Narrative <2.5s p95, Hub <150ms hop) and Temporal workflow SLAs tracked via DES-BENCH-01 benchmarking backlog. Scaling triggers for LangGraph workers, Temporal services, and Redis clusters documented in DES-19.
- **Reliability:** Deterministic replay via CouchDB event logs and Redis streams; Temporal ensures idempotent workflow execution; service workers maintain offline continuity.
- **Cost Awareness:** Bootstraps on Hetzner CPX classes, optional GPU adjacency deferred; OTel sampling tuned to stay within <$100/mo infrastructure budget.

## Implementation Handoffs & Backlog Alignment
The following backlog items carry forward into implementation planning and must reference this specification:
- `DES-BENCH-01` – Temporal throughput benchmarking for check runner and hub workflows; align metrics with Section “Performance”.
- `DES-MOD-01` – Moderation override UX; leverage live override lifecycle and cadence strip requirements captured above.
- `DES-PVP-01` – Hub PvP schema; extend contested move application within Hub Orchestrator and Temporal hub workflows.
- `IMP-AXE-01` – Accessibility automation harness; execute against the overlays and accessibility hooks summarised above.
- Future implementation stories (**to be spun up post-design**):
  1. **IaC Modules for Nomad/Vault/Observability** – follow DES-19 topology; include secrets bootstrapping and VictoriaMetrics/Loki deployment.
  2. **MinIO Lifecycle Automation** – enforce retention tiers for digests, attachments, and hub logs per DES-16 retention policy.
  3. **Search Differential Re-indexing** – schedule incremental indexing for lore/news to mitigate drift noted in DES-16 risks.
  4. **Hub Gateway Skeleton** – implement baseline uWebSockets gateway with command DSL scaffolding aligned to DES-17.

Backlog updates referencing this spec must link to `DES-20` and `SYSTEM_DESIGN_SPEC.md`, ensuring `docs/plans/backlog.md` mirrors MCP records.

## Risks & Mitigations
- **Latency Regression:** Mitigate via DES-BENCH-01 benchmarks, scaling triggers, and caching strategies (Redis, session summaries). Failure to meet budgets triggers backlog escalations tagged `risk:latency`.
- **Moderation Overload:** Cadence workflows auto-flag backlog thresholds; DES-MOD-01 must include batch decision tooling and visibility of `moderationBacklog` signals.
- **Search Drift & Index Failure:** Require automated retries, differential indexing job, and fallback to pg_trgm queries. Document incident response runbooks in implementation phase.
- **Storage Growth:** Enforce MinIO lifecycle, CouchDB compaction, and archival pipelines; monitor via `telemetry.storage.*`.
- **Policy Drift:** Architecture decisions and Prohibited Capabilities updates must be stored in MCP and mirrored in policy docs to prevent divergence between live enforcement and offline governance.

## Consistency & Governance
- Architecture decision `d52eca36-1b6d-4180-bf7b-51d515a9c2e5` (DES-19 topology) and related decisions from DES-11..DES-18 remain authoritative. Any implementation deviation must route through `mcp__game-mcp-server__check_consistency` prior to acceptance.
- Patterns `self-hosted-narrative-stack-deployment`, `momentum-driven-success-ladder`, and `temporal-lore-publishing-cadence` are reused throughout; future extensions should register derivative patterns rather than ad-hoc solutions.

## References
- `REQUIREMENTS.md`
- `DES-11-global-systems-map.md`
- `DES-12-interface-schemas.md`
- `DES-13-rules-framework.md`
- `DES-15-persistence-lore-pipeline.md`
- `DES-16-lore-publishing-cadence.md`
- `DES-17-multiplayer-hub-stack.md`
- `DES-18-admin-moderation-workflows.md`
- `DES-19-infrastructure-scaling-topology.md`
- `docs/design/diagrams/DES-20-system-synthesis.mmd`
- MCP architecture decisions and patterns referenced inside the backlog (`DES-CORE` epic)
