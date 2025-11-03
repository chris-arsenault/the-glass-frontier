# DES-12 – Interface Schemas & Accessibility Hooks

Backlog anchor: `DES-12`, Feature: `DES-CORE`

## Purpose
Translate the global systems map into actionable integration contracts binding the Narrative Engine, Temporal-driven Check Runner, and unified Web UI shell. The artefact defines message envelopes, sequencing guarantees, and accessibility guardrails so implementation can preserve freeform storytelling while disclosing background mechanics with empathy.

## Narrative Engine ↔ Check Runner Contract

### Sequence Overview
Refer to `docs/design/diagrams/DES-12-narrative-check-sequence.mmd` for the full mermaid sequence chart.

1. **Intent Intake:** Web UI forwards a player utterance (plus character context) to the Narrative Engine LangGraph.
2. **Adjudication Analysis:** Narrative Engine annotates the intent with inferred move type, stakes, momentum, and recommends whether a mechanical check is required.
3. **Check Invocation:** If mechanical resolution is needed, Narrative Engine emits `intent.checkRequest` to the Temporal task queue, referencing all context required for offline audit.
4. **Resolution Execution:** Check Runner workflow evaluates modifiers, rolls dice/probability tables, applies rule of cool bonuses, and writes an immutable audit record.
5. **Result Propagation:** Check Runner publishes `event.checkResolved`; Narrative Engine consumes it, weaves narration, and emits combined output to the Web UI.
6. **Telemetry Broadcast:** Both request and resolution events are mirrored to the event store (`telemetry.check`) for dashboards and conflict reviews.

### Request Envelope – `intent.checkRequest`
```json
{
  "id": "uuid",
  "sessionId": "uuid",
  "turnSequence": 42,
  "origin": "narrative-engine",
  "trigger": {
    "detectedMove": "risk-it-all",
    "playerUtterance": "Player intent text",
    "momentum": "advantage",
    "narrativeTags": ["hub:skyrail", "npc:Orlan"]
  },
  "mechanics": {
    "checkType": "2d6+stat",
    "stat": "ingenuity",
    "difficulty": 8,
    "advantage": true,
    "bonusDice": 1,
    "complicationSeeds": ["security_alert"]
  },
  "recommendedNarration": "If success, describe the railguns spooling up; otherwise hint at sparks and alarms.",
  "expiresAt": "2025-11-04T18:25:43.511Z",
  "metadata": {
    "tonePack": "grit-and-glass",
    "safetyFlags": [],
    "auditRef": "telemetry:session:42:check:17"
  }
}
```

- **Deterministic routing:** Partition key = `sessionId`.
- **Replay safety:** `id` is idempotency token so re-delivered messages are discarded by Temporal starter.
- **Timeouts:** `expiresAt` ensures stale checks fail gracefully; Narrative Engine should fallback to narration with “gm-error” tag if resolution misses the deadline.

### Response Envelope – `event.checkResolved`
```json
{
  "id": "uuid",               // Mirrors request id
  "sessionId": "uuid",
  "turnSequence": 42,
  "result": {
    "tier": "partial-success",
    "rolled": [4, 3, 2],
    "total": 9,
    "difficulty": 8,
    "effect": "breach",
    "complication": "alarm-escalation",
    "momentumShift": -1
  },
  "rationale": "Rule of cool advantage applied due to creative diversion; complication triggered because total < difficulty + 2.",
  "narrativePrompts": {
    "success": "The railguns bark to life, shredding the ice crawler’s plating.",
    "complication": "Red lights flare as the station AI reroutes patrols."
  },
  "latencyMs": 430,
  "auditRef": "telemetry:session:42:check:17",
  "telemetry": {
    "workflowRunId": "TemporalRunId",
    "diceSeed": "sha256:abcd..."
  }
}
```

- **Narrative Engine obligations:** Merge `narrativePrompts` with live improvisation; tag resulting GM output with `checkReference` so UI can bind disclosures.
- **Error Handling:** If `result.tier = "failed"` with `error` block present, Web UI must surface a non-blocking toast and the Narrative Engine should synthesize an apology plus fail-forward narration.
- **Latency Guard:** If `latencyMs > 1500`, record a `telemetry.check.lag` event so ops dashboards highlight queues requiring scaling.

### Failure & Retry Rules
- **Workflow errors:** Check Runner emits `event.checkFailed` with `severity` (`transient|permanent`). Narrative Engine retries transient failures once before narrating a soft fail.
- **Deadline expiry:** If Temporal returns timeout, Narrative Engine should narrate an uncertain outcome tagged with `needs-confirmation` so offline pipeline reconciles during Story Consolidation.
- **Audit trail:** Every failure payload includes `diagnostics` (stack, Temporal task token) to accelerate debugging without exposing internals to players.

## Web UI Event Surface

### Transport Model
- **Primary channel:** Secure WebSocket (`wss://.../session/{sessionId}`) multiplexing structured events with JSON payloads.
- **Fallback:** Server-Sent Events for environments where WebSockets are blocked; service worker coalesces events into IndexedDB for offline rehydration.
- **Ordering:** Events are monotonic by `turnSequence` + `subSequence`. Client discards stale events using `lastSeenSeq`.

### Event Catalogue
| Event Type | Producer | Consumer Modules | Payload Highlights |
|------------|----------|------------------|--------------------|
| `session.message` | Narrative Engine | Chat canvas, transcript cache | `{ turnSequence, speaker, text, checkReference?, toneMarkers[] }` |
| `session.marker` | Narrative Engine | Chat canvas, pacing ribbon | `{ markerType: ("pause" \| "wrap-soon"), reason, suggestedTurnsRemaining }` |
| `check.prompt` | Narrative Engine | Check overlay, accessibility announcer | `{ checkId, shortLabel, rationale, playerAgencyNote }` |
| `check.result` | Check Runner | Check overlay, transcript annotations | `{ checkId, tier, rollBreakdown[], complication?, auditRef }` |
| `overlay.characterSync` | Character System facade | Character sheet overlay, inventory | `{ revision, changedFields[], pendingOfflineReconcile }` |
| `overlay.loreLink` | Offline pipeline | Lore/news overlay, admin console | `{ sourceId, title, url, provenance }` |
| `admin.alert` | Moderation tooling | Admin panel, GM HUD | `{ severity, message, actionUrl }` |
| `telemetry.snapshot` | Observability service | Ops HUD, admin panel | `{ queueDepths, avgLatencyMs, incidentFlags[] }` |

- **Accessibility Binding:** Each event maps to ARIA-live regions or outlined overlays so screen readers announce new information without stealing focus.
- **Service Worker Hooks:** Events flagged with `cacheable: true` must be mirrored into the offline cache for continuity in spotty networks.

### Overlay Responsibilities
- **Check Overlay:** Display active checks with plain language summary, roll breakdown, and anti-spoiler toggle. Stores resolved checks in transcript annotations.
- **Pacing Ribbon:** Visual + screen-reader cues for session markers. Provides “Wrap after 1 / 2 / 3 turns” controls that feed `player.control` intents back to Narrative Engine.
- **Admin Console:** Surfaces `admin.alert` alongside moderation shortcuts (snooze, escalate). Must not render for regular players.
- **Safety Monitor:** Optionally listens for `session.message` with `safetyTag` to highlight content requiring immediate human moderation.

## Accessibility Baseline & Test Hooks
- **Contrast & Themes:** Provide high-contrast palettes meeting WCAG 2.2 AA, plus theme toggle persisted per player profile.
- **Typography:** Allow text scaling from 14px–22px without layout breakage; chat viewport reflows transcripts and overlays respond with responsive columns.
- **Screen Reader Announcements:** Chat canvas uses `role="log"` with `aria-live="polite"`; check overlay uses `aria-live="assertive"` for roll outcomes. Event payloads include `ariaLabel` strings for deterministic narration.
- **Keyboard Navigation:** All interactive controls (overlays, map, wrap toggles) reachable via tab order with visible focus states. Provide skip links to jump between chat, overlays, and admin panes.
- **Motion Sensitivity:** Respect `prefers-reduced-motion` by disabling animated pacing markers and dice roll flair.
- **Automation Hooks:** Embed `data-testid` attributes and ARIA landmarks so Playwright + axe-core can assert:
  - No critical accessibility violations (`npm run test:accessibility`).
  - Keyboard-only navigation path from chat to wrap controls and overlays.
  - Screen reader output includes check result summaries within 500ms of arrival.
- **Service Worker Fall back:** When offline, client surfaces toast “Connection lost — continuing in local cache” and queues intents; automated tests mock network loss to verify transcripts remain navigable.

## Risks & Follow-ups
- **Temporal Throughput Budget:** Need benchmarking backlog item (from DES-11) to confirm workflow latency stays under 1s at projected concurrency.
- **Search Stack Choice:** Event catalogue references lore links; final payload schema depends on Meilisearch vs. pg_trgm decision.
- **Accessibility Tooling:** Implementation must wire axe-core into CI; create follow-up backlog for `npm run test:accessibility`.
- **Hub Interop:** Sequence assumes Narrative Engine drives checks; future hub real-time checks may require shared origin semantics.
- **Data Retention:** `telemetry.check` volume grows quickly; retention policy should align with data governance design (planned for DES-15/16).

## References
- `DES-11 – Global Systems Map`
- `REQUIREMENTS.md`
- `docs/research/session-10-market-research-brief.md`
- MCP architecture decision `45bccdf8-7ab8-47e4-8cb9-6ccda3ef720e`
- MCP architecture decision `87fc0d21-0b54-463e-85c0-02f9a903004f`
