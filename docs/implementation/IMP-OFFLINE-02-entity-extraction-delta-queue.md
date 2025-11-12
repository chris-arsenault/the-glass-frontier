# IMP-OFFLINE-02 – Entity Extraction & World Delta Queue

**Backlog Anchor:** IMP-OFFLINE-02 (Entity Extraction & Delta Queue)  
**Feature:** IMP-OFFLINE – Post-Session Publishing Pipeline  
**Design References:** DES-15, DES-16, WORLD_BIBLE.md, REQUIREMENTS.md

## Summary
- Implemented a transcript-driven entity extraction workflow with heuristic control/status detection aligned to the Day-0 World Bible identifiers.
- Added moderation-aware `WorldDeltaQueue` that normalises capability references, snapshots canonical state, and emits admin alert payloads when safety reviews are required.
- Seeded coverage validating confidence thresholds, conflict detection, and capability enforcement to unblock Temporal workflow wiring.

## Code Surfaces
| Path | Purpose |
| --- | --- |
| `src/offline/entityExtraction/lexicon.js` | Canonical entity lexicon and bootstrap states derived from WORLD_BIBLE IDs. |
| `src/offline/entityExtraction/entityExtractor.js` | Transcript parser; produces structured mentions with confidence, proposed changes, and capability references. |
| `src/offline/delta/worldDeltaQueue.js` | Delta constructor that snapshots `before`/`after`, detects conflicts, and dispatches `admin.alert` notifications for moderation. |

### Mention Schema (`entityExtractor`)
```json
{
  "mentionId": "uuid",
  "entityId": "faction.prismwell-kite-guild",
  "entityType": "faction",
  "confidence": 0.95,
  "match": { "type": "canonical", "value": "Prismwell Kite Guild" },
  "proposedChanges": {
    "control": {
      "add": ["region.kyther-range"],
      "remove": []
    }
  },
  "capabilityRefs": [],
  "source": { "sessionId": "session-123", "sceneId": "scene-1", "turnId": "turn-1" }
}
```

### Delta Schema (`WorldDeltaQueue`)
```json
{
  "deltaId": "uuid",
  "entityId": "faction.prismwell-kite-guild",
  "before": { "control": [] },
  "after": { "control": ["region.kyther-range"] },
  "proposedChanges": { "control": { "add": ["region.kyther-range"], "remove": [] } },
  "capabilityRefs": [],
  "safety": {
    "requiresModeration": false,
    "reasons": [],
    "confidence": "high",
    "conflicts": []
  },
  "createdAt": "timestamp",
  "status": "pending"
}
```

## Testing
- `npm test`
- Unit coverage:
  - `__tests__/unit/offline/entityExtraction.test.js`
  - `__tests__/unit/offline/worldDeltaQueue.test.js`

## Follow-Ups
1. Integrate extractor and queue with Temporal workflows (`entityExtractionWorkflow` → `deltaDeterminationWorkflow`).
2. Expand lexicon/heuristics using world bible exports and future spaCy models.
3. Persist queue outputs to PostgreSQL tables (`entity_mentions`, `world_delta_queue`) and wire moderation dashboards to consume `admin.alert` envelopes.

