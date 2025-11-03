# IMP-CLIENT-05 – Session Closure UI

**Status:** In progress  
**Updated:** 2025-11-04  
**Owner:** Codex  
**Related Backlog:** IMP-CLIENT-05  
**Dependencies:** POST `/sessions/:sessionId/close`, session broadcaster (`session.statusChanged`, `session.closed`)

---

## Overview

This implementation introduces client-side controls and telemetry surfaces that let runners and admins end a live session, observe offline reconciliation progress, and monitor the publishing cadence. The work connects the existing closure endpoint and broadcaster events to the React shell so that closure actions are accessible, confirmable, and reflected across both the dashboard and live overlays.

## Dashboard Enhancements

- **Closure Action:** Each session card now exposes a `Close` button when the session is active and no offline reconciliation is pending. Selecting the action opens an inline confirmation panel with an optional wrap-up note; confirmation posts to `POST /sessions/:sessionId/close`. Duplicate closes are prevented while reconciliation is pending or once the session status is closed.
- **Status & Pipeline Details:** Cards now list the authoritative session status, offline pipeline state, and last cadence run metadata (`offlineLastRun`). The cadence summary surfaces next digest/batch windows to keep admins aware of upcoming publishes.
- **Feedback & Accessibility:** Confirmation panel is rendered as an `alertdialog` with labelled controls. Success/failure updates surface through the existing dashboard feedback channel.

## Session Connection & Overlay Changes

- **Status Tracking:** `useSessionConnection` accepts the selected session summary and maintains `sessionMeta` state (status, closedAt, cadence, pendingOffline). Incoming `session.statusChanged` / `session.closed` envelopes update this metadata, persist the cadence info, and flip the connection state to `closed` where appropriate.
- **Overlay Messaging:** The character overlay now renders cadence reminders, highlights closed sessions (with timestamp), and differentiates between offline queueing vs. server-side reconciliation. Status chips gain a dedicated “Closed” treatment.
- **Composer Guardrails:** `ChatComposer` blocks additional intents once the session is closed and communicates the state with a dedicated banner.

## Account Context

- Added `closeSession` helper that posts to the closure endpoint, refreshes owned sessions, and emits flash messaging for success or failure.

## Testing

- `npm test` (Jest) – covers updated dashboard interactions via `__tests__/client/accountFlows.test.jsx` plus regression suites.
- Client test additions verify the confirmation flow, optional reason propagation, and button gating logic.

## Follow-ups

- Once the offline workflow persists reconciliation history (`IMP-OFFLINE` follow-on), extend the dashboard and overlays with a timeline of recent runs.
- Evaluate Playwright coverage after future UI polishing passes to exercise the full confirmation flow in-browser.

