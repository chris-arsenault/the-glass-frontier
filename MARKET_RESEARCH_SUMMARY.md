# Market Research Summary – The Glass Frontier

## Goal Summary
Synthesize Sessions 01–09 of the research epic into a single briefing that reinforces The Glass Frontier’s cooperative GM-style storytelling mandate, aligns recommendations with `REQUIREMENTS.md`, and highlights how prior findings inform design, narrative, and technical planning going into the next phase.

## Consolidated Findings

### Narrative & Tone Guardrails (RES-01 `f842e6b4-7606-400a-81fe-8c86769126fb`, RES-02 `8bb87b27-7d88-4b7c-beb1-5320e9b34bdb`)
- Three tone archetypes (Shattered Frontier Hopepunk, Mythic Echoes, Mystic-Western) and paired naming lexicons give the GM prompt library a resilient voice while respecting freeform inputs.
- Tone bible integration points across prompt scaffolding, session memory, and offline consolidation ensure recap pipelines preserve agreed tone bands and expose drift alerts before lore publishing.
- Tone drift heuristics (power creep, mood collapse, mythic drift, hub verb overreach) define console interventions that keep narrative freedom intact without resorting to verb gating outside MUD hubs.

### Mechanics & Automation (RES-03 `8d888e77-b09b-4c8a-b8b4-126063c82421`, RES-04 `53f00d71-a60b-4b70-ad63-37126355480c`)
- Comparative analysis of FitD, PbtA, Fate, Ironsworn, and Citizen Sleeper validates a Check Runner microservice that accepts structured intent payloads yet returns narrative scaffolds instead of raw math.
- Telemetry schema proposals cover intent classification, Position/Effect, oracle payloads, RNG seeds, and safety flags so Story Consolidation and moderation can audit outcomes post-session.
- Automation guardrails emphasize visible override logging, currency tracking, and exportable roll histories, balancing transparency with the cooperative GM focus mandated in `REQUIREMENTS.md`.

### Player Experience & Pacing (RES-05 `783ae922-e057-457c-93d3-2f6609a6e50e`, RES-06 `cac74e47-4010-4601-8838-3c45d217a22c`)
- Chat-first UIs (Roll20, Foundry, Hidden Door, AresMUSH) prove transcripts must anchor the experience, with pinboard overlays for character sheets, clocks, and safety tools that never enforce rigid verbs.
- Service workers, branded offline fallbacks, background sync, and Matrix-style markers keep context docks resilient during multi-hour sessions and guarantee wrap-up prompts reconcile downstream.
- Pacing widgets surface via chat messages (turn cues, break nudges, wrap-up triggers) so long-form sessions stay flexible while emitting structured telemetry for analytics and fatigue management.

### Offline Pipelines & Moderation (RES-07 `7b9222b6-b7e4-47d2-be4d-a3372780d89b`, RES-08 `93ab540d-5f7a-4076-a16a-2e6fac8792af`)
- Event-sourced transcripts paired with CouchDB-style replication checkpoints enable offline Story Consolidation, named-entity extraction, and delta computation without blocking live narration.
- Safety tooling research (X-Card, CRDT editors, permission tiers) confirms moderation remains rare but decisive: interventions append compensating events and route to admin review dashboards with provenance.
- Metadata schema (scene IDs, faction tags, tension markers, mechanics audit trail) keeps downstream pipelines reproducible while honoring the prohibition on live world writes.

### Technical Landscape & Cost Guardrails (RES-09 `73b3791b-b896-4805-af3e-5c50ae6ad874`)
- LangGraph orchestrates GM behaviours with Temporal providing durable success-check replay, while Semantic Kernel and Guidance plug specific JS memory and constrained-generation needs.
- Persistence stack aligns with bootstrap constraints: CouchDB for log capture, PostgreSQL/pgvector for structured state, and Meilisearch/Typesense for self-hosted search—satisfying the no-managed-search requirement.
- Hetzner-linked cost envelope (<$150/month with Backblaze backups and measured GPT-4o usage) defines upgrade triggers to larger workflow/database clusters once session throughput exceeds documented thresholds.

## Implications for Design & Technical Planning
- Seed the GM prompt library, naming toolkit, and tone bible with Session 01–02 outputs; bake tone drift mitigation hooks into UI widgets and LangGraph agent nodes from the outset.
- Formalize Check Runner contracts (intent payloads, telemetry schema, override governance) before implementation so Temporal workflows and Story Consolidation auditing stay deterministic.
- Architect the web client around a persistent transcript pane, service worker caches, and scene markers; ensure wrap-up prompts emit both chat copy and structured events keyed to the metadata schema.
- Stand up an event-sourced transcript store (CouchDB or equivalent) feeding LangGraph → Temporal workflows; pair with admin review consoles that render moderation flags alongside replication status.
- Implement baseline observability and cost monitors (LLM spend, replication lag, Redis memory) so the bootstrap budget guidelines from Session 09 remain enforceable.

## Outstanding Risks & Follow-Ups
- Prototype LangGraph + Temporal integration that replays success checks with full telemetry (RES-09) before design freeze.
- Model “community surge vs. studio-led campaign” cost scenarios to validate the bootstrap envelope under stress (RES-09).
- Benchmark Meilisearch relevance and latency against PostgreSQL `pg_trgm` as the documented fallback (RES-09).
- Build an ingestion spike emitting the shared event metadata schema to confirm storage overheads and ensure CRDT/replication flows resolve conflicts cleanly (RES-08).
- Define accessibility baselines for the chat client (contrast, transcript search, audio narration) and verify background sync fallbacks on browsers lacking the API (RES-05/RES-06).

## Research Asset Index

| Session | Backlog Item | Research Cache ID | Local Artefact |
|---------|--------------|-------------------|----------------|
| 01 | RES-01 | `f842e6b4-7606-400a-81fe-8c86769126fb` | docs/research/session-01-narrative-benchmarking.md |
| 02 | RES-02 | `8bb87b27-7d88-4b7c-beb1-5320e9b34bdb` | docs/research/session-02-extended-narrative-benchmarking.md |
| 03 | RES-03 | `8d888e77-b09b-4c8a-b8b4-126063c82421` | docs/research/session-03-gameplay-system-comparables.md |
| 04 | RES-04 | `53f00d71-a60b-4b70-ad63-37126355480c` | docs/research/session-04-automated-check-runner-tradeoffs.md |
| 05 | RES-05 | `783ae922-e057-457c-93d3-2f6609a6e50e` | docs/research/session-05-player-experience-ux.md |
| 06 | RES-06 | `cac74e47-4010-4601-8838-3c45d217a22c` | docs/research/session-06-context-dock-resilience.md |
| 07 | RES-07 | `7b9222b6-b7e4-47d2-be4d-a3372780d89b` | docs/research/session-07-offline-pipelines-and-moderation.md |
| 08 | RES-08 | `93ab540d-5f7a-4076-a16a-2e6fac8792af` | docs/research/session-08-story-consolidation-world-deltas.md |
| 09 | RES-09 | `73b3791b-b896-4805-af3e-5c50ae6ad874` | docs/research/session-09-technical-landscape.md |

## Source Highlights
- Tone, naming, and tone-control exemplars: *AI Dungeon*, Hidden Door, *Ironsworn: Starforged*, *Wanderhome*, *Coyote & Crow*, *Citizen Sleeper*.
- Mechanics & automation precedents: *Blades in the Dark*, *Apocalypse World*, *Fate Core*, *Ironsworn*, *Citizen Sleeper*, Cortex Prime/Tales of Xadia, Genesys, Lancer COMP/CON.
- UX & resilience references: Roll20, Foundry VTT, Hidden Door, AresMUSH, Matrix spec v1.16, MDN Service Worker & Background Sync docs, web.dev offline fallback guide.
- Pipeline, moderation, and storage research: Foundry journal exports, CouchDB replication, Event sourcing (Fowler), Yjs CRDT, X-Card tooling, LangChain summarisation, spaCy NER, Neo4j KG guidance, Debezium CDC, Temporal Concepts.
- Technical landscape and cost sources: LangGraph, LlamaIndex Flow, Semantic Kernel, Microsoft Guidance, Temporal, Prefect, BullMQ, CouchDB, PostgreSQL/pgvector, Meilisearch/Typesense, Hetzner Cloud pricing, Backblaze B2 pricing, OpenAI pricing.

