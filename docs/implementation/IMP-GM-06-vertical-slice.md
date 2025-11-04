# IMP-GM-06 – Live Session Vertical Slice & Transcript Export

**Date:** 2025-11-05  
**Backlog:** `IMP-GM-06` (P1)  
**Touchpoints:** Narrative engine, check runner, session memory, offline closure pipeline, unified overlays.

## Intent
- Drive a deterministic solo-session script through the LangGraph narrative engine and check runner without manual intervention.
- Capture the resulting dialogue, check transparency, and safety outcomes directly into `SessionMemoryFacade` transcript and change-feed entries.
- Close the session and push the captured artifacts through the `SessionClosureCoordinator` + `ClosureWorkflowOrchestrator` so downstream publishing can consume transcripts, mentions, and delta recommendations.

## Approach
1. **Scenario Harness:** Introduce a reusable helper that wires together `SessionMemoryFacade`, `CheckBus`, `NarrativeEngine`, `CheckRunner`, and `ClosureWorkflowOrchestrator`. The harness accepts a scripted list of player intents plus a deterministic dice randomizer so we can exercise specific success tiers.
2. **Transcript & Change Feed:** Extend `SessionMemoryFacade.appendTranscript` to emit change-feed entries and add system-authored transcript rows when checks resolve or are vetoed. This ensures the offline pipeline and transparency UIs both see the same audit trail.
3. **Safety Veto Path:** When the narrative flow flags a prohibited capability, the harness will dispatch a synthetic check request carrying the safety flag so `CheckRunner` can exercise its veto logic and emit moderation alerts.
4. **Session Closure:** After the scripted intents run, the harness marks the session closed, queues the offline job, and waits for `offline.sessionClosure.completed` so tests can assert reconciled state and publishing metadata.

## Implementation Notes
- `SessionMemoryFacade.appendTranscript` now records transcript entries with a `transcript` change-feed action and adds system-authored entries when checks resolve or are vetoed, carrying check metadata and momentum deltas.
- Added `src/narrative/scenarios/verticalSliceScenario.js` providing `runVerticalSliceScenario` and `createSequentialRandomizer` helpers to execute the deterministic solo-session flow and drive the offline closure pipeline.
- New Jest coverage:
  - `__tests__/integration/gm/verticalSliceScenario.test.js` runs the harness end-to-end, verifying transcript logging, closure job completion, and delta/mention counts.
  - `__tests__/unit/memory/sessionMemory.transcript.test.js` locks down transcript/change-feed behaviour for append, resolution, and veto paths.
- `npm test` passes, including the vertical slice integration run.

## Validation Strategy
- **Integration Test:** Add a Jest integration test that runs the full harness, verifying:
  - Resolved and vetoed checks are captured in transcript entries with check metadata.
  - `SessionMemoryFacade.changeFeed` includes transcript append actions.
  - Offline closure jobs mark reconciliation complete and record workflow history.
- **Unit Updates:** Extend existing `SessionMemoryFacade` unit coverage where needed to reflect the new transcript/change-feed behaviour.
- **Automation:** Run `npm test` to execute the new integration coverage alongside existing suites.

## Outstanding Considerations
- Playwright coverage for the client overlays will be deferred to client-focused PBIs (`IMP-CLIENT-06` already tracks overlay validation).
- Live LangGraph smoke validation remains an outstanding task noted on the backlog item (requires backend environment).
- Additional safety scripting (e.g., consent-required soft fails) can be layered once we flesh out the full move library.
