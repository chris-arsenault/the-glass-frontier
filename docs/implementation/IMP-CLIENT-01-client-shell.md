# IMP-CLIENT-01 – Web Client Shell & Chat Canvas

Backlog item: `a3ad4893-73d1-4275-bd59-fd8f6601b5ac`  
Related design artefacts: `DES-12-interface-schemas.md`, `SYSTEM_DESIGN_SPEC.md`

## Overview

This iteration establishes the player-facing Vite/React client shell with an accessible chat-first layout, transport integrations, and initial overlay scaffolding. The shell listens to the narrative event stream via WebSockets with automatic fallback to Server-Sent Events, exposing markers and live connection status alongside a character/inventory overlay dock.

### Key Capabilities

- React 18 client rendered through `client/src/App.jsx` with StrictMode and contextual session state.
- `useSessionConnection` hook manages WebSocket transport, SSE fallback, event ordering guardrails, and player intent submission.
- Chat canvas exposes `role="log"`/`aria-live="polite"` semantics, announces connection state, and auto-scrolls for new beats.
- Composer form enforces accessible labels and re-uses the Narrative Engine REST endpoint for intent submission.
- Overlay dock surfaces placeholder character/inventory panels plus live momentum snapshots derived from session markers.
- Session pacing ribbon renders the latest markers, giving players at-a-glance wrap guidance per DES-12.

## Build & Run

```sh
# Launch Vite dev server (proxied to express backend on port 3000)
npm run client:dev

# Production build served by express via dist/ assets
npm run client:build

# Preview static build locally
npm run client:preview
```

Express now serves `/dist` assets in production and exposes `/sessions/:sessionId/events` for SSE fallback. WebSocket and SSE endpoints share broadcaster fan-out to keep event parity.

## Testing

- Component coverage lives under `__tests__/client/components.test.jsx` using React Testing Library.
- Run targeted UI tests with `npm run test:client` or the full suite (`npm test`) which exercises backend + client checks.
- Tests assert:
  - Chat canvas renders messages and connection states.
  - Composer dispatches intents through session provider callbacks.
  - Pacing ribbon and overlay dock expose marker/momentum data.

## Accessibility & Resilience Hooks

- Dark theme with WCAG 2.2 AA contrast; focus outlines for keyboard navigation.
- `prefers-reduced-motion` enforcement disables transitions for sensitive players.
- Connection state copy pipes through `aria-live` regions; momentum overlays reflect fallback status for offline continuity messaging.
- SSE fallback heartbeats every 25 s to keep intermediary proxies warm; reconnection logic re-attempts WebSocket after transient errors.

## Follow-Ups

- Wire character/inventory overlays to real `overlay.characterSync` events once session memory surfaces them.
- Extend pacing ribbon with wrap controls emitting `player.control` intents (IMP-CLIENT-02 scope).
- Layer automated accessibility scanning (axe-core) after IMP-AXE-01 lands.

