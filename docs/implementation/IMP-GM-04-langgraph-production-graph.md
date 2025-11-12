# IMP-GM-04 · LangGraph Narrative Nodes & Tool Harness

## Overview
The production LangGraph orchestration now powers the narrative engine. Player turns flow through a declarative node graph that mirrors DES-11/12/13: scene framing, intent intake, safety gating, check planning, and narrative weaving. Each node emits telemetry, contributes deterministic prompt packets, and defers side effects to a shared tool harness so integrations remain testable.

## Node Graph
1. **scene-frame (`sceneFrameNode`)** – Packages location, character, inventory highlights, and momentum into a GM-facing prompt defined in `src/narrative/prompts.js`.
2. **intent-intake (`intentIntakeNode`)** – Annotates player utterances with tone, move tags, creative spark, and a check recommendation using DES-13 heuristics.
3. **safety-gate (`safetyGateNode`)** – Flags prohibited capabilities/content warnings. High/critical hits raise `safety.escalate` with an audit ref.
4. **check-planner (`checkPlannerNode`)** – Builds LangGraph check envelopes (`trigger`, `mechanics`, `metadata`) plus backwards-compatible `data` for the Temporal runner. Prompt hashes (SHA-256) track the check planning prompt.
5. **narrative-weaver (`narrativeWeaverNode`)** – Produces GM narration with session markers, optionally noting pending checks or moderation escalation.

The orchestrator (`src/narrative/langGraph/orchestrator.js`) executes nodes sequentially, logging `telemetry.session.transition` entries for `start|success|error`.

## Tool Harness
`src/narrative/langGraph/toolHarness.js` centralises IO with deterministic retries:
- **Session memory** – Appends player/GM transcript entries and records check requests/vetoes.
- **Check dispatch** – Emits `intent.checkRequest`, tagging `telemetry.session.check-dispatch`.
- **Moderation** – Raises `admin.alert` envelopes when safety escalates and mirrors `telemetry.session.safety`.
- **Audit refs** – Generates `${component}:${sessionId}:${turnSequence}:${uuid}` identifiers for traceability.

Retries default to 2 with jittered delays; each failure logs `telemetry.session.tool-error`.

## Telemetry Surface
`src/narrative/langGraph/telemetry.js` emits structured events via the existing JSON logger:
- `telemetry.session.transition` – Node boundaries with status + turn sequence.
- `telemetry.session.check-dispatch` – Check envelopes sent to Temporal queues.
- `telemetry.session.safety` – Safety escalations and moderation reasons.
- `telemetry.session.tool-error` – Harness retry diagnostics.
- `telemetry.session.check-resolution` – Recorded whenever `event.checkResolved` is consumed.

These events satisfy DES-12 transparency requirements and feed the existing observability stack.

## Check Envelope Schema
Example payload emitted on `intent.checkRequest`:
```json
{
  "id": "uuid",
  "sessionId": "session-123",
  "turnSequence": 17,
  "origin": "narrative-engine",
  "auditRef": "check:session-123:17:…",
  "trigger": {
    "detectedMove": "delve-the-ruins",
    "detectedMoveTags": ["delve-the-ruins", "risk-it-all"],
    "playerUtterance": "I sneak between pylons before the patrol notices.",
    "momentum": 1,
    "narrativeTags": ["delve-the-ruins", "risk-it-all"],
    "safetyFlags": []
  },
  "mechanics": {
    "checkType": "2d6+stat",
    "stat": "finesse",
    "difficulty": "risky",
    "difficultyValue": 9,
    "advantage": false,
    "bonusDice": 1,
    "complicationSeeds": ["security_alert", "echoing_footfalls"]
  },
  "metadata": {
    "tone": "stealth",
    "promptHash": "sha256:…",
    "creativeSpark": true,
    "safetyFlags": []
  },
  "data": {
    "move": "delve-the-ruins",
    "tags": ["delve-the-ruins", "risk-it-all"],
    "difficulty": "risky",
    "difficultyValue": 9,
    "ability": "finesse",
    "momentum": 1,
    "flags": ["disclosure:delve-the-ruins", "creative-spark"],
    "safetyFlags": [],
    "playerId": "player-1",
    "mechanics": {
      "stat": "finesse",
      "statValue": 2,
      "bonusDice": 1,
      "difficulty": "risky",
      "difficultyValue": 9,
      "momentum": 1,
      "advantage": false
    }
  }
}
```
Clients continue consuming the envelope wholesale while the Temporal runner reads the `data` block for backwards compatibility.

## Running Locally
1. `npm install`
2. `npm run dev` – launches the narrative engine/websocket server.
3. `POST /sessions/{sessionId}/messages` with `{ "playerId": "player-1", "content": "I sneak past the guards." }`.
4. Subscribe to `ws://localhost:3000/ws?sessionId={sessionId}` for `session.message`, `intent.checkRequest`, `check.result`, `admin.alert`.

## Verification
- `npm test` – exercises updated Jest suites, including `__tests__/unit/narrativeEngine.test.js` for graph flow, telemetry, and safety escalation.
- Existing integration suites validate REST/WebSocket surfaces without changes.

## Follow-ups
- Replace heuristic nodes with actual LangGraph/LLM templates once LangGraph workers ship (ties to future MCP stories).
- Pipe telemetry events into OTEL exporters (blocked on IMP-OBS-01).
- Wire Temporal client once the check runner migrates off in-memory simulation.

