# IMP-GM-01 · Narrative Engine Skeleton

## Overview
The initial LangGraph-inspired narrative engine skeleton now lives under `src/`. It follows the DES-11/12/13 sequencing: player intents pass through an intent parser, the rules router decides whether to emit `intent.checkRequest`, and the narrative weaver produces GM-facing responses. Session context is backed by an in-memory facade that exposes hard memory shards (character, inventory, relationships) to stay aligned with `SYSTEM_DESIGN_SPEC.md`.

## Running Locally
1. Install dependencies once: `npm install`
2. Start the service: `npm run dev` (defaults to `PORT=3000`)
3. POST player input to `POST /sessions/{sessionId}/messages` with `{ "playerId": "...", "content": "..." }`
4. (Optional) Resolve checks by calling `POST /sessions/{sessionId}/checks/{checkId}/resolve`
5. Attach a WebSocket client to `ws://localhost:3000/ws?sessionId={sessionId}` to receive `session.message`, `intent.checkRequest`, and `event.checkResolved` payloads.

## Module Layout
- `src/narrative/narrativeEngine.js` orchestrates nodes.
- `src/narrative/nodes/intentParserNode.js` infers tone + check needs.
- `src/narrative/nodes/rulesRouterNode.js` shapes check envelopes per DES-13.
- `src/narrative/nodes/narrativeWeaverNode.js` produces GM narration and markers aligned with DES-12 interface schemas.
- `src/events/checkBus.js` standardizes `intent.checkRequest` / `event.checkResolved`.
- `src/memory/sessionMemory.js` exposes the session memory facade referenced in SYSTEM_DESIGN_SPEC §3.2.
- `src/server/app.js` and `src/server/index.js` expose REST + WebSocket surfaces for the web client (IMP-CLIENT feature).

## Verification
`npm test` runs Jest suites covering:
- Graph node coordination + check emission heuristics.
- HTTP routes for player turns and check resolution.

## Follow-ups
- Swap the in-memory session memory for PostgreSQL/CouchDB per DES-15 storage plan.
- Replace heuristics with actual LangGraph/LLM orchestration and Temporal workflow calls once those services are online.
- Expand telemetry/export wiring to OTEL exporters (ties to IMP-OBS-01).
