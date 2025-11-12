# IMP-GM-02 · Temporal Check Runner & Momentum Engine

## Overview
Session 33 delivered the Temporal-inspired check runner pipeline that consumes `intent.checkRequest` envelopes, resolves success ladders deterministically, and feeds momentum/stat updates back into the session memory facade. The runner operates inside the Node service as a stand-in for Temporal workflows, preserving DES-13 contracts while we stand up full Temporal infrastructure.

## Key Modules
- `src/checkRunner/checkRunner.js` — Listens to the shared `CheckBus`, applies deterministic 2d6 resolution with momentum-driven advantage/disadvantage, emits `event.checkResolved`, `event.checkVetoed`, and `admin.alert` envelopes, and records telemetry.
- `src/events/checkBus.js` — Updated with `event.checkVetoed`/`admin.alert` topics and helpers so downstream systems receive safety escalations.
- `src/memory/sessionMemory.js` — Tracks momentum state, stat adjustments, turn sequence, and veto history while maintaining ephemeral scope.
- `src/narrative/narrativeEngine.js` & nodes — Annotate narrative markers with momentum snapshots and react to veto events to keep transcripts consistent.
- `src/telemetry/checkMetrics.js` — Emits `telemetry.check.*` log lines for DES-BENCH-01 instrumentation targets.

## Resolution Flow
1. `NarrativeEngine` emits `intent.checkRequest`; session memory stamps `sequence`.
2. `CheckRunner` hashes `{sessionId, checkId, sequence, difficulty, stat}` to seed deterministic dice.
3. Advantage triggers when momentum ≥ +2 or `creative-spark` flags exist; disadvantage triggers on momentum ≤ −2 or `safety:reckless`.
4. Tier outcomes (`critical-success` → `hard-miss`) adjust momentum and stat scores in-memory, clamped to −2..+3.
5. Partial/fail-forward/hard-miss tiers attach complication payloads for UI disclosure.
6. Safety flags (`prohibited-capability`, `content-warning`) short-circuit to `event.checkVetoed` plus `admin.alert`, leaving momentum untouched and clearing pending checks.

## Telemetry & Logs
- `telemetry.check.run` — { checkId, tier, latencyMs, momentumDelta, move }
- `telemetry.check.veto` — { checkId, reason, safetyFlags }
- `telemetry.check.error` — { checkId, message }
These feed directly into upcoming DES-BENCH-01 dashboards.

## Safety Hooks
- Prohibited capability and content warning keywords are detected in `rulesRouterNode`.
- Veto envelopes include audit refs, move metadata, and safety flags for moderation follow-up.
- `SessionMemoryFacade` records veto history while preventing duplicate entries from CheckRunner/NarrativeEngine.

## Testing
- `npm test` runs expanded Jest suites:
  - `__tests__/unit/checkRunner.test.js` covers all success ladder tiers, momentum deltas, stat adjustments, and safety veto behavior.
  - Existing engine/unit/integration suites ensure narrative routing and HTTP surfaces remain stable.

## Follow-ups
- Swap the in-process runner for Temporal workflows once infrastructure lands.
- Externalize prohibited capability lexicon to moderation service (`IMP-MOD`).
- Extend advantage heuristics with LangGraph creativity scoring when available.
