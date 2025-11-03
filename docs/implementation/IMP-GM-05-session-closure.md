# IMP-GM-05 – Session Closure & Offline Triggering

**Date:** 2025-11-04  
**Backlog:** `IMP-GM-05` (P1)  
**Touchpoints:** Live narrative loop, post-session pipeline preflight, unified web client (upcoming follow-up `IMP-CLIENT-05`).

## Summary
- Added a `POST /sessions/:sessionId/close` API guarded by bearer auth. The endpoint marks the session as closed, records the audit trail, and queues post-session processing.
- Extended `SessionDirectory` and `SessionMemoryFacade` with closure semantics (status updates, cadence refresh, offline reconciliation flag, audit metadata).
- Introduced a simple `SessionClosureCoordinator` queue that captures closure jobs until Temporal workers are wired in (`IMP-OFFLINE-04`).
- Broadcasts `session.statusChanged` and `session.closed` events via the SSE/WebSocket broadcaster for client refreshes and admin consoles.

## Implementation Notes
- **Auth & Routing:** `createApp` now exposes `POST /sessions/:sessionId/close`, using shared bearer-token middleware. The route appends a system transcript entry for provenance.
- **SessionDirectory:** New `closeSession` method flips status to `closed`, updates timestamps, recalculates publishing cadence, and delegates to `SessionMemory` for offline reconciliation flags.
- **SessionMemory:** Added `markSessionClosed` to persist closure metadata (`closedAt`, `closedBy`, `closureReason`, `lastClosureAuditRef`) and mark `pendingOfflineReconcile = true`.
- **Offline Coordination:** `SessionClosureCoordinator` currently logs queued jobs (`offline.sessionClosure.queued`). Jobs capture audit ref, momentum snapshot, and cursor positions for later workflows.
- **Event Fan-out:** Closure endpoint publishes `session.statusChanged` plus `session.closed` with cadence summary, enabling overlays/admin surfaces to refresh without polling.
- **Alerts:** If coordinator queuing fails, the system emits an `admin.alert` via `CheckBus` (`reason: offline.enqueue_failed, severity: high`).

## Data & Telemetry
- Cadence planner reruns on closure; summary payload returns `cadence.nextDigestAt`, `cadence.moderationWindow`.
- Closure job payload captures `changeCursor`, `lastAckCursor`, and pending check count for offline sanity checks.
- Logging publisher emits `offline.sessionClosure.queued` entries for observability ingestion once pipelines activate.

## Verification
- **Unit:** `__tests__/unit/auth/sessionDirectory.test.js` validates cadence refresh, offline flagging, and audit metadata persistence.
- **Integration:** `__tests__/integration/auth.account.test.js` exercises the closure endpoint end-to-end (auth, queue enqueue, broadcaster events, session memory flag).
- **Regression:** `npm test` (Jest) covering new and existing suites.

## Follow-up / Dependencies
- `IMP-CLIENT-05` will surface closure controls and status to users.
- `IMP-OFFLINE-04` will replace the in-process coordinator with real Temporal workflow orchestration.
- Moderation dashboards (`IMP-MOD-01/02/03`) depend on closure events to populate queues and SLA timers.
