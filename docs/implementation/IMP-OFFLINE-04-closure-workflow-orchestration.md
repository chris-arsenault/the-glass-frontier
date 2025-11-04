# IMP-OFFLINE-04 – Closure Triggered Workflow Orchestration

**Backlog Anchor:** IMP-OFFLINE-04 (Closure Triggered Workflow Orchestration)  
**Feature:** IMP-OFFLINE – Post-Session Publishing Pipeline  
**Design References:** DES-15, REQUIREMENTS.md, IMP-GM-05 Session Closure Implementation

## Summary
- Added an in-process `ClosureWorkflowOrchestrator` that subscribes to `SessionClosureCoordinator` jobs, runs story consolidation, entity extraction, world delta queueing, and publishing preparation, then updates session state.
- Extended the coordinator to track lifecycle metadata (queued → processing → completed/failed), emit telemetry topics, and notify listeners asynchronously.
- Enriched session memory summaries with offline reconciliation metadata and workflow history so clients/admin dashboards can surface orchestration progress.
- Bootstrapped the orchestrator alongside the server and wired graceful shutdown so post-session automation stays active before Temporal workers replace it.

## Implementation Highlights
- `src/offline/closureWorkflowOrchestrator.js`: orchestrates closure jobs, sanitises transcripts, triggers orchestrated workflows, records telemetry, and emits admin alerts when failures or SLA breaches occur.
- `src/offline/sessionClosureCoordinator.js`: tracks start/completion timestamps, attempts, results, and supports listener registration for job dispatch while logging telemetry events.
- `src/memory/sessionMemory.js`: records offline workflow history, marks reconciliation completion, and clears `pendingOfflineReconcile` once the pipeline finishes.
- `src/auth/sessionDirectory.js`: exposes `offlineLastRun` and `offlineReconciledAt` summaries for client dashboards.
- `src/server/index.js`: boots the orchestrator alongside the HTTP stack and gracefully stops it on shutdown.
- `src/telemetry/offlineMetrics.js`: telemetry emitter for `telemetry.offline.workflow.*` topics.
- `src/offline/temporal/workerConfig.js`: parses Temporal worker environment configuration so Nomad jobs can inject namespaces/task queues without hard-coding stage values.
- `__tests__/unit/offline/*.test.js`: coverage for coordinator lifecycle and orchestration success/failure flows.

## Telemetry & Alerts
- Emits `telemetry.offline.workflow.started|completed|failed|latency` for monitoring.
- Retains existing `admin.alert` pathways for enqueue failures and adds alerts for orchestration failures or SLA breaches.
- Preserves downstream telemetry from story consolidation, publishing, and search sync planners.

## Verification
- `npm test`
- Targeted unit coverage:
  - `__tests__/unit/offline/sessionClosureCoordinator.test.js`
  - `__tests__/unit/offline/closureWorkflowOrchestrator.test.js`
- Existing integration suites (`auth.account`, `app`, `memory.api`) continue to pass.

## Follow-Ups
1. Swap the in-process orchestrator for Temporal workers once the Temporal deployment lands; reuse metrics topics for parity.
2. Persist workflow history to durable storage (PostgreSQL) and expose in admin dashboards.
3. Extend entity extraction to incorporate spaCy/NER outputs when available, ensuring orchestrator interfaces remain compatible.
4. Hook publishing completion into moderation dashboards once `IMP-MOD` features ship.
