# IMP-CLIENT Overlays – Contest & Publishing Unification

Backlog item: `IMP-CLIENT-07` (MCP ID `64d6a12c-15e6-4064-9e9f-2d4e6b9cfcf0`)

## Overview

- Unified the session overlay so contested encounters, cooldown sentiment, and offline publishing progress live in one docked experience.
- Surfaced hub contest telemetry (participants, outcomes, rematch cooling, shared complications) alongside the existing check disclosures.
- Exposed offline publishing phase health with a three-stage summary (Story Consolidation → Delta Review → Publish) that highlights running/queued/blocked states and recent failures.
- Added an admin-only CTA that pivots straight into the moderation/capability policy dashboard whenever cooldown sentiment spikes above the elevated threshold.

## UI & Interaction Updates

- `OverlayDock.jsx`
  - New **Contest Timeline** card renders the latest hub contest history with role-tagged participants, momentum shifts, and complication excerpts.
  - Sentiment summary badge (steady/watch/elevated/critical) pulls from `/admin/moderation/contest/sentiment` and announces negative cooldown ratios in-line.
  - Sentiment badge now highlights stale telemetry, shows an empty-state when no cooldown samples are available, and withholds the moderation CTA until meaningful data arrives.
  - Admin CTA (“Review capability policy”) jumps to the Moderation tab and drops a flash message when frustration crosses the elevated line.
  - Pipeline card now shows explicit stage chips with Temporal-aligned status labels (`queued`, `processing`, `completed`, `failed`, `idle`) and richer offline metadata.
- `app.css` gains supporting styles for contest timeline layouts, status pills, sentiment badges, and pipeline stage blocks.

## Data & Telemetry

- Client fetches contest sentiment only when the viewer holds admin privileges; results are rendered incrementally and cached in component state.
- Contest sentiment requests are re-triggered when hub contest telemetry delivers fresher data and when the cached payload becomes stale (5-minute threshold) so admins see live cooldown shifts without reloading.
- Reused SSE-fed `hubContests` payload from `useSessionConnection` so timelines stay in sync with IMP-HUBS-05 telemetry.
- Stage status builder derives failure/queued/running state from `sessionOfflineHistory`, `sessionOfflineJob`, and `sessionOfflineLastRun` to reflect Temporal job health without extra requests.
- Button and filter interactions emit namespaced telemetry (`client.overlay.moderation.opened`, `client.pipeline.stage` events piggyback on existing pipeline event names).

## Testing

- `npm test -- --runInBand`
  - Extends `__tests__/client/components.test.jsx` to cover contest timelines, sentiment loading, moderation CTA routing, and pipeline stage presentation.
