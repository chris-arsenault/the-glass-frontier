# IMP-HUBS-05 – Hub PvP Contested Interactions

## Summary
- Added contested metadata to the hub verb catalog, now shipping `verb.challengeDuel`, `verb.sparringMatch`, and `verb.clashOfWills` templates that tag PvP-capable verbs with collision windows, moderation markers, and participant roles per DES-EDGE-01.
- Introduced a `ContestCoordinator` inside the Hub Orchestrator to aggregate conflicting intents, launch Temporal contest workflows, and broadcast contest lifecycle telemetry/state to connected clients.
- Extended hub state snapshots and the Check Overlay UI so participants see arming/resolving contests, keyed by contest identifiers with role annotations and moderation-ready context.
- Wired Temporal contest resolution payloads back into hub room state so overlays disclose outcome tiers, momentum shifts, and shared complications as soon as workflows complete.
- ContestCoordinator now emits explicit timeout states; Hub Orchestrator broadcasts `contestExpired` events so players get real-time feedback when duels fizzle without a defender.
- Check Overlay now narrates `contestExpired` events with in-world prompts and rematch cues so players feel the fizzle and know how to re-engage.
- Captured moderation-dashboard-ready telemetry for contested sparring flows (`artifacts/hub/contest-moderation-2025-11-04T07-39-50-547Z.json`) showing armed → launched → resolved lifecycle payloads and broadcast samples for admin review.
- Extended the contest monitoring CLI and moderation ingestion so NDJSON logs, timeline artefacts, and stored summaries all produce the same aggregated contest metrics, now including timeout/expiry samples.
- Tuned contested PvP verb windows (6–7 s) and Temporal resolution timing so the latest load sample lands within DES-BENCH-01 targets (arming p95 7.1 s, resolution p95 780 ms); captured the confirming artefacts in `artifacts/hub/contest-moderation-load-2025-11-04T11-15-00.000Z.ndjson` and its generated summary.

## Implementation Notes
- `src/hub/config/defaultVerbCatalog.json` now defines `contest` blocks (window, label, roles, moderation/shared complication tags) for contested verbs spanning duels, sparring, and social clashes. The verb catalog normaliser (`src/hub/verbCatalog.js`) validates the new schema.
- `src/hub/commandParser.js` enriches command metadata with contest descriptors (contest key, participants, contested actors) so downstream narrators/telemetry/alarm paths stay aware of PvP escalations.
- `src/hub/orchestrator/contestCoordinator.js` orchestrates contest bundling, timeout expiry, and Temporal workflow hand-offs. `hubOrchestrator` consumes the coordinator to update room state, telemetry, and broadcast meta payloads.
- `ContestCoordinator.resolve` now honours Temporal workflow timings (`resolution.timings.resolutionDurationMs` / `resolvedAt` stamps) so telemetry reflects true workflow runtime instead of dispatch latency.
- `HubOrchestrator` persists contest state updates (arming, resolving, expired, resolved), rebroadcasts hub state, records telemetry, and emits downstream events so overlays and narrative hooks stay synchronized.
- Hub telemetry (`src/hub/telemetry/hubTelemetry.js`) gained contest lifecycle events (`contestArmed`, `contestLaunched`, `contestWorkflow*`, `contestResolved`) for observability dashboards.
- `src/telemetry/contestMetrics.js` captures contest lifecycle metrics (arming latency, timeout latency, resolution latency, participant demand) and logs `telemetry.contest.*` events consumed by DES-BENCH-01 benchmarking and moderation dashboards. The CLI helper `scripts/benchmarks/contestWorkflowMonitor.js` now surfaces timeout aggregates alongside p95 checks against the 8 s arming / 800 ms resolution budgets.
- Client hook `useSessionConnection` listens for `hub.stateSnapshot`/`hub.stateUpdate` envelopes, caching contest arrays that feed the refreshed `CheckOverlay`.
- `client/src/components/CheckOverlay.jsx` renders a "Contested encounters" section, highlighting arming/resolving contests with participant roles and contest IDs for rapid moderation follow-through.
- `artifacts/hub/contest-moderation-2025-11-04T07-39-50-547Z.json` captures sparring telemetry and broadcast payloads for moderation dashboards to ingest while the dedicated UI lands (`IMP-MOD-01`).

## Monitoring & Benchmarking
- Contest telemetry now emits structured JSON log lines (`telemetry.contest.armed|launched|resolved`) carrying arming/resolve durations, participant counts, and moderation context.
- Run `npm run monitor:contests -- --input <telemetry-log.ndjson|timeline.json|summary.json>` to summarise p50/p95 arming and resolution latency against the DES-BENCH-01 targets (arming ≤8,000 ms p95, resolution ≤800 ms p95) and to track multi-actor demand via participant counts. Timeout samples now appear in the summary so designers can audit how often duels elapse without defenders.
- Latest load telemetry captured on 2025-11-04 (`artifacts/hub/contest-moderation-load-2025-11-04T11-15-00.000Z.ndjson`) lands within budget (arming p95 7,100 ms, resolution p95 780 ms) per the generated summary (`artifacts/hub/contest-moderation-summary-2025-11-04T11-15-00.000Z.json`). Timeout metrics remain available for on-demand review rather than automated distribution.

## Testing
- Added integration coverage in `__tests__/integration/hub/hubOrchestrator.integration.test.js` validating duel verbs arm → launch contest workflows and broadcast contest state/meta.
- Added integration coverage for contest timeouts, ensuring `contestExpired` state updates broadcast before subsequent commands.
- Expanded `__tests__/client/components.test.jsx` so contested encounters—including timeout narration—surface in the Check Overlay with screen-reader-friendly copy.
- Added unit coverage for `ContestMetrics` (`__tests__/unit/telemetry/contestMetrics.test.js`), the contest monitoring CLI (`__tests__/unit/scripts/contestWorkflowMonitor.test.js`), and the ContestCoordinator timeout workflow to keep latency analysis and multi-actor reporting deterministic.
- Ran `npm run test:unit -- contest` for hub orchestration/telemetry suites and `npm run test:client` to validate the refreshed overlay experience.

## Next Steps & Risks
- Introduce rematch offers/cooldowns directly in contested verbs so timeouts feed back into gameplay instead of leaving rooms idle.
- Evaluate demand for multi-actor skirmishes; if required, extend contest key generation to support >2 participants without fragmenting registration windows.
- Coordinate with Temporal workflow owners to guarantee `resolution.timings` payloads remain populated so telemetry stays aligned with real workflow runtimes.
- Monitor player sentiment around the new timeout narration to shape rematch pacing and future moderation hooks.

## References
- Backlog: `IMP-HUBS-05` (`b183607a-8f77-4693-8eea-99409baec014`)
- Design: `docs/design/DES-EDGE-01-contested-move-playbook.md`, `docs/design/DES-17-multiplayer-hub-stack.md`
- Code: `src/hub/orchestrator/contestCoordinator.js`, `src/hub/orchestrator/hubOrchestrator.js`, `client/src/hooks/useSessionConnection.js`, `client/src/components/CheckOverlay.jsx`
