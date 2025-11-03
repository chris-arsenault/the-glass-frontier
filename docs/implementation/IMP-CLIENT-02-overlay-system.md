# IMP-CLIENT-02 – Overlay System & Pacing Ribbon

Backlog item: `1b6eed28-6276-4430-b35b-32e677e60074`
Related design artefacts: `DES-12-interface-schemas.md`, `SYSTEM_DESIGN_SPEC.md`

## Overview

This increment wires the client shell overlays to live session data, exposes check disclosures, and adds wrap controls aligned with DES-12 pacing guidance. The React hook now mirrors overlay state from the Narrative Engine, while Express surfaces supporting APIs for initial hydration and player control intents.

### Key Capabilities

- `useSessionConnection` fetches `/sessions/:sessionId/state`, tracks `overlay.characterSync`, `check.prompt`, and `check.result` events, and exposes wrap control helpers.
- Check overlay panel announces pending prompts and resolved results, including dice breakdowns, complications, audit references, and momentum deltas via ARIA live regions.
- Pacing ribbon gains accessible "Wrap after 1/2/3 turns" controls, emitting `player.control` intents through the new REST endpoint and reflecting acknowledgements.
- Overlay dock renders character, stats, inventory, and offline reconciliation cues from session memory snapshots, staying resilient during SSE fallback.

### API Changes

- `GET /sessions/:sessionId/state` returns overlay snapshot, pending checks, and recent resolved checks for initial client hydration.
- `POST /sessions/:sessionId/control` accepts wrap intents (`{ type: "wrap", turns }`), persists them in session memory, and broadcasts `player.control` events.
- Server broadcaster now mirrors check envelopes on both `intent.checkRequest` → `check.prompt` and `event.checkResolved` → `check.result`, while streaming updated overlay snapshots (`overlay.characterSync`).

### Testing

- `npm test` – full Jest suite covering client overlays, backend integrations, and narrative/check subsystems.

### Follow-Ups

- Service worker (`IMP-CLIENT-03`) should cache overlay snapshots and control acknowledgements for offline continuity.
- Axe/Playwright automation (`IMP-AXE-01`) must verify screen reader output for the new overlay sections and wrap controls.
- Extend character facade once session memory ingests authoritative inventory updates from persistence systems.
