# IMP-AXE-01 – Accessibility Automation Pipeline

## Overview
Playwright now runs axe-core scans across the unified client shell so regression suites surface accessibility issues without manual sweeps. The harness exercises online and offline scenarios aligned with DES-12 requirements.

## Implementation Notes
- Added `@axe-core/playwright` and `axe-html-reporter` as dev dependencies.
- Authored `tests/e2e/accessibility.spec.js` to cover:
  - Chat shell baseline while online.
  - Chat composer offline announcements.
  - Overlay dock with queued offline intents.
- Results are serialized via `artifacts/accessibility/<state>.{json,html}` for historical auditing.

## Usage
- Local run: `npm run test:accessibility`
- CI: include `npm run test:accessibility` before publishing builds; reports are ready for artifact upload.

## Follow-Ups
- Extend coverage to admin surfaces once moderation tooling ships.
- Integrate the new suite into CI gating and publish artifacts per run.
