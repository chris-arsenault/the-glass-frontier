# IMP-HUBS-05 – Hub PvP Contested Interactions

## Summary
- Added contested metadata to the hub verb catalog, now shipping `verb.challengeDuel`, `verb.sparringMatch`, and `verb.clashOfWills` templates that tag PvP-capable verbs with collision windows, moderation markers, and participant roles per DES-EDGE-01.
- Introduced a `ContestCoordinator` inside the Hub Orchestrator to aggregate conflicting intents, launch Temporal contest workflows, and broadcast contest lifecycle telemetry/state to connected clients.
- Extended hub state snapshots and the Check Overlay UI so participants see arming/resolving contests, keyed by contest identifiers with role annotations and moderation-ready context.
- Wired Temporal contest resolution payloads back into hub room state so overlays disclose outcome tiers, momentum shifts, and shared complications as soon as workflows complete.
- Hardened publishing retry summaries so offline cadence reporting remains resilient when contest-driven retries occur.
- Captured moderation-dashboard-ready telemetry for contested sparring flows (`artifacts/hub/contest-moderation-2025-11-04T07-39-50-547Z.json`) showing armed → launched → resolved lifecycle payloads and broadcast samples for admin review.

## Implementation Notes
- `src/hub/config/defaultVerbCatalog.json` now defines `contest` blocks (window, label, roles, moderation/shared complication tags) for contested verbs spanning duels, sparring, and social clashes. The verb catalog normaliser (`src/hub/verbCatalog.js`) validates the new schema.
- `src/hub/commandParser.js` enriches command metadata with contest descriptors (contest key, participants, contested actors) so downstream narrators/telemetry/alarm paths stay aware of PvP escalations.
- `src/hub/orchestrator/contestCoordinator.js` orchestrates contest bundling, expiry, and Temporal workflow hand-offs. `hubOrchestrator` consumes the coordinator to update room state, telemetry, and broadcast meta payloads.
- `HubOrchestrator.resolveContest` now persists Temporal resolution payloads, rebroadcasts hub state, records telemetry, and emits downstream events so admin dashboards and overlays stay synchronized.
- Hub telemetry (`src/hub/telemetry/hubTelemetry.js`) gained contest lifecycle events (`contestArmed`, `contestLaunched`, `contestWorkflow*`, `contestResolved`) for observability dashboards.
- Client hook `useSessionConnection` listens for `hub.stateSnapshot`/`hub.stateUpdate` envelopes, caching contest arrays that feed the refreshed `CheckOverlay`.
- `client/src/components/CheckOverlay.jsx` renders a "Contested encounters" section, highlighting arming/resolving contests with participant roles and contest IDs for rapid moderation follow-through.
- `artifacts/hub/contest-moderation-2025-11-04T07-39-50-547Z.json` captures sparring telemetry and broadcast payloads for moderation dashboards to ingest while the dedicated UI lands (`IMP-MOD-01`).

## Testing
- Added integration coverage in `__tests__/integration/hub/hubOrchestrator.integration.test.js` validating duel verbs arm → launch contest workflows and broadcast contest state/meta.
- Expanded `__tests__/client/components.test.jsx` to ensure contested encounters surface in the Check Overlay and remain accessible via screen-reader-friendly copy.
- Ran `npm test` to exercise the full Jest suite (hub orchestration, offline pipelines, client overlays).

## Next Steps & Risks
- Monitor Temporal load—parallel contest workflows amplify check pressure; revisit DES-BENCH-01 limits after broader verb coverage lands.
- Coordinate with `IMP-MOD-01` once moderation dashboards begin implementation so the captured contest telemetry artefacts wire directly into admin override workflows.
- Evaluate demand for multi-actor skirmishes; if required, extend contest key generation to support >2 participants without fragmenting registration windows.

## References
- Backlog: `IMP-HUBS-05` (`b183607a-8f77-4693-8eea-99409baec014`)
- Design: `docs/design/DES-EDGE-01-contested-move-playbook.md`, `docs/design/DES-17-multiplayer-hub-stack.md`
- Code: `src/hub/orchestrator/contestCoordinator.js`, `src/hub/orchestrator/hubOrchestrator.js`, `client/src/hooks/useSessionConnection.js`, `client/src/components/CheckOverlay.jsx`
