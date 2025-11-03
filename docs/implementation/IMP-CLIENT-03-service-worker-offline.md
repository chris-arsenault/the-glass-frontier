# IMP-CLIENT-03 – Service Worker & Offline Continuity

Backlog item: `cf0d6a31-0942-4703-9c12-f09ffb5d1b51`
Related design artefacts: `DES-12-interface-schemas.md`, `SYSTEM_DESIGN_SPEC.md`

## Overview

This increment implements the offline continuity layer for the unified web client. The React session hook now persists transcript and overlay data to IndexedDB, queues player intents during network loss, and replays them deterministically once the connection stabilises. A production service worker caches shell assets and session state APIs so the client survives WebSocket outages by relying on SSE and cached state.

### Key Capabilities

- Service worker caches entry assets and `/sessions/:id/state` responses using a cache-first / network-first hybrid strategy to support offline resume and SSE fallback.
- `useSessionConnection` persists messages, markers, overlay snapshots, and queued intents into an IndexedDB database (`glass-frontier-offline`) with deterministic replay semantics.
- Player intents submitted while offline are stored, surfaced in the UI, and flushed automatically when connectivity returns; overlay panels reflect pending changes and queue depth.
- UI surfaces (chat composer, overlays, pacing ribbon) expose offline banners, disable wrap controls, and announce restrictions through ARIA live regions.

### Testing

- `npm run test:client` – Jest component suite (overlay, queue banner, wrap control gating).
- `npm run test:e2e` – Playwright offline continuity flow toggling Chromium’s network stack and verifying queue replay.

### Follow-Ups

- Add axe-core automation once `IMP-AXE-01` lands to cover new offline banners and status messaging.
- Consider background sync integration once server exposes authenticated endpoints (Temporal workflow integration).
- Revisit IndexedDB retention to honour data expiry policy from RES-06 once defined.
