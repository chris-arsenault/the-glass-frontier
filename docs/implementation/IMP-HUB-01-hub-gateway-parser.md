# IMP-HUB-01 – Hub Gateway & Command Parser Skeleton

**Related backlog item:** `IMP-HUB-01` (feature `IMP-HUBS`)  
**Scope:** Baseline transport/gateway, declarative verb DSL, presence scaffolding, telemetry hooks, and integration tests for hub command replay and narrative escalation.

## Outcomes
- Added Hub service modules under `src/hub`:
  - `hubGateway.js` orchestrates authenticated connections, heartbeats, WebSocket + SSE fallback, and command dispatch across a transport-agnostic interface.
  - `commandParser.js`, `verbCatalog.js`, and `rateLimiter.js` implement the declarative verb DSL, capability validation (via the Prohibited Capabilities registry), and burst/room-wide rate limiting.
  - Presence/action log scaffolding (`presence/inMemoryPresenceStore.js`, `presence/redisPresenceStore.js`, `actionLog/*.js`) provide in-memory defaults and Redis/CouchDB adapters aligned with DES-17 persistence expectations.
  - `telemetry/hubTelemetry.js` and `narrative/hubNarrativeBridge.js` emit `telemetry.hub.*` events and bridge escalations into the existing Narrative Engine.
  - `transport/sseTransport.js` enables SSE fallback with HTTP command submission for clients that cannot open WebSockets.
- Seeded a starter verb catalog (`config/defaultVerbCatalog.json`) covering narrative chat, trade proposals, and capability-gated relic invocations.

## HTTP Surface
Call `hubGateway.attachHttpInterface({ app, ssePath, commandPath })` against an Express router to expose:
- `GET {ssePath}` – SSE stream delivering hub updates/acks (`hub.*` envelopes). Query params accept `hubId`, `roomId`, `actorId`, `sessionId`, `connectionId`, and optional `actorCapabilities`.
- `POST {commandPath}` – JSON command submission when using SSE fallback. Body: `{ "connectionId": "...", "command": { "verb": "...", "args": {...}, "metadata": {...} } }`.

## Testing
- Added unit coverage for verb catalog validation and command parsing/rate limiting.
- Added integration tests (`__tests__/integration/hub/hubGateway.integration.test.js`) exercising command acceptance, narrative escalation, action log persistence, and replay delivery.
- `npm test` runs all suites (node environment, no additional services required).

## Follow-Ups
- Implement production Redis/CouchDB clients and wire telemetry emitter into platform observability stack.
- Extend verb catalog auto-loader to support per-hub overrides sourced from PostgreSQL (`hub_verbs`).
- Add e2e coverage once hub UI overlays are available (ties into `IMP-HUB-UX`).
