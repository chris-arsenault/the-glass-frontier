# DES-19 – Infrastructure & Scaling Topology

Backlog anchor: `DES-19`, Feature: `DES-CORE`

## Purpose
Define the self-hosted infrastructure, deployment tiers, and scaling levers that keep The Glass Frontier’s cooperative GM storytelling responsive and trustworthy. This session packages the hosting topology for LangGraph-driven narrative services, Temporal workflows, data stores, and the unified web client while honoring cost guardrails, moderation transparency, and the prohibition on managed search stacks.

## Guiding Tenets
- **Narrative-first reliability:** Latency budgets for narrative turns (< 2.5 s p95) and hub interactions (< 150 ms hop) drive infrastructure choices.
- **Self-hosted core:** Primary services (LLM proxy, Temporal, CouchDB, PostgreSQL, Redis, Meilisearch/pg_trgm, MinIO) run on customer-managed infrastructure with clear upgrade triggers.
- **Transparent operations:** Observability, audit trails, and moderation hooks propagate through every layer so overrides and safety interventions remain explorable.
- **Cost-aware scaling:** Start with lean instances informed by `RES-09` estimates and scale horizontally only when concurrency and retention thresholds are crossed.
- **Security & compliance:** Enforce TLS, role-aware networking, and data residency controls; protect Prohibited Capabilities registries and audit history from tampering.

## Deployment Tiers

| Tier | Purpose | Hosting Footprint | Key Differences |
|------|---------|-------------------|-----------------|
| **Local Dev** | Individual contributor environments | Docker Compose + Tilt on laptops | Single-node Temporal dev server, in-memory LangGraph stub, SQLite for quick iteration. |
| **Integration (Stage)** | Shared QA for design artefacts, UX, and load rehearsal | Hetzner CX/CPX instances + Tailscale mesh | Mirrors prod topology at smaller scale, synthetic LLM responses capped to 5 tps, anonymised datasets. |
| **Production** | Live narrative sessions, hub traffic, moderation | Multi-VM footprint across two availability zones (e.g., Hetzner FSN + NBG) | Hardware isolation for data stores, hot standby for Temporal/PostgreSQL, autoscaling edge tier, 24/7 telemetry. |

## High-Level Topology

- **Edge Layer:** `Caddy` reverse proxies terminate TLS (ACME) and route `/app` traffic to the web client, `/api` to API gateway, `/ws` to socket services. Static assets served from `Caddy` file server backed by nightly rsync pushes.
- **Application Plane:** Kubernetes is deferred until concurrency justifies; instead run services on Nomad or systemd-managed containers with HashiCorp Consul for discovery.
  - **Narrative Orchestrator Pods (LangGraph JS workers)** behind `narrative-proxy` service with sticky sessions per `sessionId`.
  - **LLM Proxy:** Node service handling provider credentials, request shaping, streaming responses, and caching via Redis.
  - **Hub Gateway & Orchestrator:** uWebSockets.js instances with Redis Streams (per DES-17) deployed as autoscalable units using systemd + pm2.
  - **Temporal Workers:** Separate process pools for Check Runner, story consolidation, entity extraction, moderation queue fan-out, and infrastructure automation.
- **Data & State Layer:** Dual Postgres clusters (HA pair), CouchDB cluster (3 nodes with `_replicator` to archival node), Redis (primary + replica), MinIO object storage (erasure-coded, 4 nodes), Meilisearch primary + follower, and Kafka/Redpanda event bus mirrored to S3-compatible cold storage weekly.
- **Observability Plane:** OpenTelemetry collector agents push traces/metrics/logs to VictoriaMetrics + Loki + Grafana; Alertmanager triggers PagerDuty/webhook notifications.

See `docs/design/diagrams/DES-19-infrastructure-topology.mmd` for deployment graph.

## Service Breakdown & Scaling Triggers

### LangGraph Narrative Plane
- **Bootstrap Capacity:** 3 JS workers (2 vCPU, 4 GB RAM each) behind `narrative-proxy`, hosted on Hetzner CPX21 (€8.70/mo) instances.
- **Scaling Trigger:** > 40 concurrent sessions or p95 latency > 2.5 s for 15 min. Action: add worker, pin new sessions via Consul service weights, warm caches with tone/lore snippets.
- **Failover:** Session metadata stored in CouchDB enables replay on cold worker. Blue/green deployments use versioned prompt packs with canary release to 10% load.

### LLM Provider Strategy
- **Primary:** OpenAI GPT-4.1 via private relay with streaming; **Fallback:** Anthropic Claude via same interface.
- **Budget Controls:** Per-session cost ceilings enforced by proxy; once `usage >= 85%` of weekly budget, escalate to human GM queue.
- **Caching:** Redis stores last-scene summary + momentum calculations to avoid repeated re-prompts; TTL 10 minutes with invalidation on moderator overrides.

### Temporal Workflow Stack
- **Bootstrap Footprint:** 1 Temporal frontend + matching on CPX21, 1 history + worker DB on PostgreSQL primary.
- **Scaling Trigger:** `telemetry.temporal.workflowLag` p95 > 5s for 10 min or > 20 active workflows per core. Action: split history service to dedicated CPX31 (4 vCPU) and add worker nodes using Nomad jobs.
- **Reliability:** Frontend behind keepalived virtual IP; workers register health with Consul, enabling rolling restarts during spec upgrades.

### Hub Real-Time Services
- **Deployment:** Edge nodes host `hub-gateway` processes with pm2 clustering (4 workers). Redis and orchestrator pool run on dedicated VM to protect from noisy neighbors.
- **Scaling Trigger:** CPU > 70% or queue backlog > 200 commands; add orchestrator worker or new gateway instance; use consistent hashing on `roomId` to minimize state skew.
- **Failover:** Hot standby Redis replica; orchestrators persist action logs to CouchDB per DES-17 to allow replay on new node.

### Persistence & Search
- **CouchDB:** 3-node cluster (2 primary, 1 arbiter) per DC with cross-DC replication. Checkpoints stored hourly to MinIO. Trigger: `_changes` lag > 3 min → add replication worker or upgrade IOPS.
- **PostgreSQL:** Patroni-managed HA pair + async read replica. Partition heavy tables by session/epoch. Trigger: write-ahead log > 70% of disk capacity or CPU > 60% sustained.
- **Meilisearch / pg_trgm:** Bootstrap with Meilisearch on CPX11; fallback to PostgreSQL `tsvector` search. Trigger: query latency > 200 ms or index > 50 GB prompts shift to sharded Meilisearch or PostgreSQL partitioning.
- **MinIO:** 4-node erasure-coded cluster for attachments, transcripts, exported reports. Lifecycle rules push cold data to Backblaze B2 monthly; encryption via server-side keys with rotation every 90 days.

### Audit & Moderation Surfaces
- **Admin Dashboard:** Next.js/React served from same API tier; websockets subscribe to `admin.alert` topics via Kafka.
- **Safety Analytics:** Temporal workflows emit metrics to VictoriaMetrics; dashboards highlight override rates, delta backlog age.
- **Compliance Storage:** Audit refs stored in CouchDB with read-only replicas; nightly job validates hash chain and logs to append-only S3 bucket.

## Networking & Security
- **Zero-Trust Mesh:** Tailscale or WireGuard mesh between nodes; edge proxies only expose ports 80/443/8443.
- **Secrets Management:** HashiCorp Vault sealed with Shamir shares; workers fetch short-lived tokens for LLM and database credentials.
- **Rate Limiting:** `Caddy` enforces per-IP limits; hub gateway applies token bucket per character; API gateway throttles admin exports to preserve stability.
- **DDoS Posture:** Lightweight mitigation using `Caddy` built-in fail2ban integration; Cloudflare DNS only (no CDN) while bootstrap; optional CDN evaluation deferred until stage shows > 200 concurrent viewers.
- **Backup & Restore:** Nightly PostgreSQL base backup + WAL shipping; CouchDB incremental replicator; Redis snapshots hourly; MinIO versioning always on.

## Observability & Telemetry
- **Metrics:** OpenTelemetry instrumentation for narrative latency, Temporal queue depth, hub command throughput, admin override frequency (`telemetry.moderation.overrides`), and cost markers.
- **Tracing:** Jaeger UI layered on top of OTEL collector for debugging multi-step narrative flows.
- **Logging:** Loki ingests structured JSON logs; correlation IDs align with `auditRef` to trace overrides end-to-end.
- **Alerting:** Alertmanager routes P1 incidents (latency, data loss risk) to 24/7 rotation; P2 (cost approaching ceiling, backlog drift) to product channel with recommended playbooks.

## Cost Envelope & Upgrade Path
- **Bootstrap (~$310/mo):** Edge (2× CPX11), Narrative plane (3× CPX21), Temporal core (2× CPX21), Data stores (PostgreSQL HA CPX31 + CPX21, CouchDB CPX21×3), Redis (CPX11), MinIO (CX21×4), Meilisearch (CPX11), Observability (CX21×2), Backups (B2 storage).
- **Scale-Up Triggers:**
  - > 60 concurrent sessions or hubs saturating CPU → add narrative/hub workers, consider container orchestration (Nomad) auto-scaling.
  - Storage > 70% capacity or Lore index > 50 GB → shard PostgreSQL and Meilisearch, add archival nodes.
  - Temporal throughput > 150 workflows/hour → move frontend/matching to dedicated high-CPU nodes, evaluate Temporal Cloud only if ops budget exceeds team bandwidth (documented in backlog as risk).
  - CDN adoption when global latency p95 > 300 ms (players outside EU) → evaluate self-hosted Fastly equivalent (BunnyCDN) with cached read-only lore; keep writer endpoints private.

## Risk Register
- **Ops Overhead:** Mitigation by codifying Infrastructure-as-Code (Terraform + Nomad jobs). Document runbooks in `docs/ops/`.
- **LLM Provider Outage:** Fallback to Anthropic or local quantized LLM for low-stakes narration with notice; escalate to human GM overlay.
- **Data Breach:** Zero-trust mesh, per-service RBAC, encryption at rest, and quarterly penetration tests once implementation begins.
- **Cost Drift:** Weekly cost reports from OTEL metrics; backlog action `DES-BENCH-01` consumes telemetry to set alert thresholds.
- **Scaling Complexity:** Introduce Kubernetes only when automation debt becomes blocker; store decision in MCP before adoption.

## Follow-Ups & Dependencies
- Feed scaling metrics and triggers into `DES-BENCH-01` benchmarking plan.
- Coordinate with `DES-MOD-01` to ensure admin surfaces receive monitoring hooks and incident export pathways.
- Seed implementation backlog for Infrastructure-as-Code modules (Terraform, Nomad job specs) and for OTEL instrumentation harness.
- Update accessibility automation backlog (`IMP-AXE-01`) with deployment path for accessibility regression runner in CI.

## References
- `docs/design/DES-11-global-systems-map.md`
- `docs/design/DES-12-interface-schemas.md`
- `docs/design/DES-15-persistence-lore-pipeline.md`
- `docs/design/DES-16-lore-publishing-cadence.md`
- `docs/design/DES-17-multiplayer-hub-stack.md`
- `docs/design/DES-18-admin-moderation-workflows.md`
- `docs/research/session-09-technical-landscape.md`
- `REQUIREMENTS.md`
