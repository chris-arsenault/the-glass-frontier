# Session 09 – Technical Landscape Assessment

Backlog anchor `RES-09` examines the technical substrate that will sustain The Glass Frontier’s cooperative GM storytelling model once design and implementation follow-ons begin.

## Research Goals
- Identify orchestration frameworks that let us script multi-step LLM behaviours, guarantee transparent success checks, and remain portable across JavaScript-first services.
- Evaluate background task runtimes that keep offline pipelines resilient without imposing managed-service dependencies.
- Compare persistence and indexing layers that respect the offline-first publishing cadence while staying within bootstrap budgets.
- Establish an initial cost envelope for the unified web client and post-session automation so the production roadmap can phase investments responsibly.

## Approach
1. Trace requirements in `REQUIREMENTS.md` that emphasise freeform storytelling, offline pipelines, and the prohibition on managed search stacks.
2. Review prior sessions’ findings (Sessions 03–08) to avoid duplicating mechanics and moderation research while extending the infrastructure map.
3. Focus on self-hostable, open-source, or low-lift SaaS options that we can progressively harden—highlighting triggers that justify scaling up.

## LLM Orchestration & Agent Frameworks

| Option | Strengths for The Glass Frontier | Gaps / Risks | Adoption Notes |
| --- | --- | --- | --- |
| LangGraph (LangChain) | Event-driven graphs orchestrate multi-agent conversations with tool invocation and state checkpoints, aligning with transparent rolls and recap summaries.[^langgraph-docs] | Python-first with emerging JS bindings; requires custom persistence for replay beyond built-in memory stores. | Treat as the default orchestrator for narrative prototyping; persist state to CouchDB/PostgreSQL via adapter before production. |
| LlamaIndex Flow | Provides declarative node/edge pipelines with observability hooks for evaluating agent decisions and cost metrics.[^llamaindex-flow] | Observability UI is commercial; JS support lags behind Python. | Use for analytics-heavy pipelines (entity extraction experiments); keep core GM loop on LangGraph to avoid split stacks. |
| Semantic Kernel | Polyglot SDK (C#, Python, JS) with planners, memories, and skills abstractions that map to our hard memory requirements.[^semantic-kernel] | Planner outputs can become non-deterministic without guardrails; orchestration primitives less opinionated than LangGraph. | Integrate selectively for JS services that need memory plugin management (character sheets, inventory). |
| Guidance + FastAPI | Guidance DSL enforces constrained generation (dice roll disclosures, safety hooks) while FastAPI keeps orchestration lightweight and self-hosted.[^guidance-docs] | Less ecosystem support; requires custom tooling for retries and logging. | Reserve for specialized generators (Prohibited Capabilities enforcement, lore tone guardrails). |

## Background Task & Workflow Runtimes

| Runtime | Fit for Offline Pipelines | Gaps / Risks | Operational Notes |
| --- | --- | --- | --- |
| Temporal | Durable workflows with replay semantics capture post-session pipelines, retries, and human-in-the-loop timers cleanly.[^temporal-docs] | Operational overhead: requires frontend, matching, history, worker, and backing DB clusters. | Bootstrap with Temporal on a single CPX21-class VM backed by PostgreSQL; document upgrade trigger to dedicated cluster once throughput > 20 sessions/day. |
| Prefect | Python-native DAG runner with hosted UI and self-hosted Orion server; great for scheduling enrichment jobs and monitoring failures.[^prefect-docs] | JS integration indirect (would need API calls); concurrency features less deterministic than Temporal. | Embed for analytics and batch exports; keep real-time moderation workflows on Temporal/BullMQ. |
| BullMQ + Redis | Simple queues with repeatable jobs and delayed retries that map to Node background processors.[^bullmq-docs] | Requires vigilance for exactly-once semantics; Redis persistence limited without snapshot tuning. | Pair with LangGraph workers for quick-turn automation; migrate long-running jobs to Temporal when pipeline depth grows. |
| Argo Workflows | Kubernetes-native workflow CRDs offer parallel fan-out for media processing and heavy NLP workloads.[^argo-docs] | Assumes Kubernetes mastery; overkill for bootstrap scale and increases ops burden. | Document as a scale-up path for GPU-assisted pipelines once content volume demands k8s. |

## Persistence, Indexing, and Stream Layers

| Layer | Role in the Pipeline | Strengths | Gaps / Risks | Notes |
| --- | --- | --- | --- | --- |
| CouchDB | Primary session/event log with multi-master replication for offline capture clients.[^couchdb-docs] | Built-in revision history simplifies conflict inspection; `_changes` feed drives downstream processors. | Conflict resolution remains custom; view indexing slower on large datasets. | Keep as bootstrap default; shard by session to keep document size bounded. |
| PostgreSQL + Logical Replication | Canonical store for structured lore, quest state, and audit trails.[^postgres-logical] | SQL accessibility for admin consoles; supports `pgvector` for semantic lookups without managed search stacks.[^pgvector-docs] | Logical slots require monitoring to prevent replication lag; write amplification if mixing OLTP + analytics. | Run alongside Temporal DB; snapshot to S3/B2 nightly via `pg_dump`. |
| EventStoreDB (Kurrent) | Append-only stream store for immutable transcript events.[^eventstore-docs] | Built-in stream metadata, projections, and linkTo semantics ease saga orchestration. | Fewer JS client libraries; ops overhead (gRPC + admin UI) beyond CouchDB. | Flag as upgrade when event ordering guarantees trump CouchDB conflicts. |
| Meilisearch | Faceted full-text search for published lore without managed Elasticsearch.[^meilisearch-docs] | Rapid indexing, low operational overhead, HTTP API suits web client. | Snapshot size grows quickly; relevancy tuning required for mixed languages. | Deploy behind API gateway; sync from PostgreSQL materialized views. |
| Typesense | Alternative vectorless search tuned for typo tolerance.[^typesense-docs] | High availability via Raft; simple JSON schema. | Smaller ecosystem vs Meilisearch; no embedded vector search. | Use when we need strict latency SLAs and multi-region replication. |
| Litestream + SQLite | Edge cache for character sheets and recent session context on the chat server.[^litestream-docs] | Low cost, streaming backups to S3/B2; works with serverless footprints. | Not ideal for concurrent writes; needs application-level locking. | Pair with CouchDB to localise read-heavy data while staying resumable offline. |

## Cost Envelope Modeling

| Component | Bootstrap Configuration | Monthly Cost (USD) | Scale Trigger / Notes |
| --- | --- | --- | --- |
| Unified web client + API | Vite/Node on Hetzner CPX11 (2 vCPU, 2GB) behind Fly.io/NGINX.[^hetzner-pricing] | $6.06 | Upgrade to CPX21 when concurrent users > 150 monthly active or latency > 200 ms. |
| Workflow runtime | Temporal + PostgreSQL co-located on Hetzner CPX21 with nightly Backblaze B2 backups.[^backblaze-pricing] | $13.40 compute + ~$5 storage | Split Temporal to dedicated nodes once workflows exceed 50 concurrent executions. |
| Redis queue (BullMQ) | Redis Stack (Docker) on shared CPX11 instance. | ~$0 incremental (shares host) | Migrate to managed-OSS or Redis Cluster when pending jobs > 5k or memory > 75%. |
| Search / Lore index | Meilisearch on shared CPX11 with weekly snapshots to B2. | ~$3 storage overhead | Move to dedicated CPX21 if index > 20GB or query latency > 150 ms. |
| Object storage & backups | Backblaze B2 (2 TB/month transfer cap assumed).[^backblaze-pricing] | ~$10 for 1 TB stored + 1 TB download | Evaluate Wasabi/Storj if egress grows beyond 2 TB/month. |
| LLM usage | OpenAI GPT-4o/GPT-4.1 mix at 180k input + 60k output tokens per session, 30 sessions/month.[^openai-pricing] | ~$120 | Revisit fine-tuning or local models when monthly spend > $300 and latency budgets allow batching. |

> **Assumptions:** Self-host in a single EU region; monitoring via open-source stack (Prometheus + Grafana) on shared nodes; exclude developer labour and DNS/CDN fees (<$5/month via Cloudflare).

## Implications for Design & Engineering
- Standardise on LangGraph for GM orchestration while capturing state to CouchDB/PostgreSQL so moderation and analytics share the same truth.
- Adopt Temporal early to guarantee deterministic post-session pipelines; carve out BullMQ for fast, lightweight automation that does not need full workflow replay.
- Keep PostgreSQL as the nexus for structured lore and embed `pgvector` to satisfy semantic recall without managed search; pair with Meilisearch for full-text discovery.
- Track LLM spend per session to validate the offline cadence; integrate cost telemetry into the admin console highlighted in Session 08.
- Stage infrastructure upgrades around clear load triggers to avoid premature scaling while maintaining a documented path to high availability.

## Open Questions & Next Steps
- Prototype a LangGraph + Temporal integration that emits success-check results into the event log to validate transparency guarantees.
- Model two additional cost scenarios (community-driven peak vs studio-led campaign) to pressure-test the $150/month bootstrap envelope.
- Validate Meilisearch relevance on mixed lore content and benchmark query latency against PostgreSQL `pg_trgm` indexes as a fallback.
- Draft a candidate architecture note summarising the stack choice once LangGraph + Temporal prototype metrics arrive.

## Sources & References
- LangChain. “LangGraph Overview.” <https://python.langchain.com/docs/langgraph/>[^langgraph-docs]
- LlamaIndex. “Workflow: Flow.” <https://docs.llamaindex.ai/en/stable/module_guides/workflow/flow.html>[^llamaindex-flow]
- Microsoft. “Semantic Kernel Overview.” <https://learn.microsoft.com/en-us/semantic-kernel/overview/>[^semantic-kernel]
- Microsoft Guidance. “Guidance: A DSL for AI Control.” <https://microsoft.github.io/guidance/>[^guidance-docs]
- Temporal Technologies. “Temporal Concepts.” <https://docs.temporal.io/>[^temporal-docs]
- Prefect. “Prefect 2 Documentation.” <https://docs.prefect.io/latest/>[^prefect-docs]
- BullMQ. “BullMQ Documentation.” <https://docs.bullmq.io/>[^bullmq-docs]
- CNCF. “Argo Workflows Documentation.” <https://argo-workflows.readthedocs.io/>[^argo-docs]
- Apache CouchDB. “Introduction to Replication.” <https://docs.couchdb.org/en/stable/replication/intro.html>[^couchdb-docs]
- PostgreSQL Documentation. “Logical Replication.” <https://www.postgresql.org/docs/current/logical-replication.html>[^postgres-logical]
- PostgreSQL. “pgvector Extension.” <https://github.com/pgvector/pgvector>[^pgvector-docs]
- EventStore Ltd. “EventStoreDB Documentation.” <https://developers.eventstore.com/server/v21.10/>[^eventstore-docs]
- Meilisearch. “Documentation.” <https://www.meilisearch.com/docs>[^meilisearch-docs]
- Typesense. “Typesense Documentation.” <https://typesense.org/docs/>[^typesense-docs]
- Litestream. “High Availability SQLite.” <https://litestream.io/>[^litestream-docs]
- Hetzner. “Cloud Pricing.” <https://www.hetzner.com/cloud>[^hetzner-pricing]
- Backblaze. “B2 Cloud Storage Pricing.” <https://www.backblaze.com/b2/cloud-storage-pricing.html>[^backblaze-pricing]
- OpenAI. “Pricing.” <https://openai.com/pricing>[^openai-pricing]

[^langgraph-docs]: LangChain. “LangGraph Overview.” <https://python.langchain.com/docs/langgraph/>
[^llamaindex-flow]: LlamaIndex. “Workflow: Flow.” <https://docs.llamaindex.ai/en/stable/module_guides/workflow/flow.html>
[^semantic-kernel]: Microsoft. “Semantic Kernel Overview.” <https://learn.microsoft.com/en-us/semantic-kernel/overview/>
[^guidance-docs]: Microsoft Guidance. “Guidance: A DSL for AI Control.” <https://microsoft.github.io/guidance/>
[^temporal-docs]: Temporal Technologies. “Temporal Concepts.” <https://docs.temporal.io/>
[^prefect-docs]: Prefect. “Prefect 2 Documentation.” <https://docs.prefect.io/latest/>
[^bullmq-docs]: BullMQ. “BullMQ Documentation.” <https://docs.bullmq.io/>
[^argo-docs]: CNCF. “Argo Workflows Documentation.” <https://argo-workflows.readthedocs.io/>
[^couchdb-docs]: Apache CouchDB. “Introduction to Replication.” <https://docs.couchdb.org/en/stable/replication/intro.html>
[^postgres-logical]: PostgreSQL Documentation. “Logical Replication.” <https://www.postgresql.org/docs/current/logical-replication.html>
[^pgvector-docs]: PostgreSQL. “pgvector Extension.” <https://github.com/pgvector/pgvector>
[^eventstore-docs]: EventStore Ltd. “EventStoreDB Documentation.” <https://developers.eventstore.com/server/v21.10/>
[^meilisearch-docs]: Meilisearch. “Documentation.” <https://www.meilisearch.com/docs>
[^typesense-docs]: Typesense. “Typesense Documentation.” <https://typesense.org/docs/>
[^litestream-docs]: Litestream. “High Availability SQLite.” <https://litestream.io/>
[^hetzner-pricing]: Hetzner. “Cloud Pricing.” <https://www.hetzner.com/cloud>
[^backblaze-pricing]: Backblaze. “B2 Cloud Storage Pricing.” <https://www.backblaze.com/b2/cloud-storage-pricing.html>
[^openai-pricing]: OpenAI. “Pricing.” <https://openai.com/pricing>
