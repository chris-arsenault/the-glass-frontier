# IMP-GM-03 · Session Memory & Character Facade

## Overview
Session 38 upgrades the narrative stack with a production-ready session memory service that satisfies the DES-11/DES-15 persistence contracts. The new facade models hard context shards (character, inventory, relationships, momentum), introduces an optimistic-locking API for LangGraph nodes, streams change feeds for offline pipelines, and enforces the Prohibited Capabilities List via the moderation registry stub. All state remains ephemeral until consolidated offline, preserving the live-session canon guardrail in `REQUIREMENTS.md`.

## Schema Design
### PostgreSQL tables (shards + change feed)
```sql
-- Characters & Momentum (structured shards)
CREATE TABLE session_character_shards (
  session_id TEXT PRIMARY KEY,
  revision BIGINT NOT NULL DEFAULT 1,
  actor TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  character JSONB NOT NULL,
  inventory JSONB NOT NULL,
  relationships JSONB NOT NULL,
  momentum JSONB NOT NULL,
  last_ack_cursor BIGINT NOT NULL DEFAULT 0,
  pending_offline BOOLEAN NOT NULL DEFAULT FALSE,
  capability_refs JSONB NOT NULL DEFAULT '[]'::JSONB
);

CREATE TABLE session_memory_change_feed (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  shard TEXT NOT NULL, -- character | inventory | relationships | momentum
  action TEXT NOT NULL, -- replace | momentum-adjustment | stat-adjustment | update
  actor TEXT NOT NULL,
  reason TEXT,
  revision BIGINT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'ephemeral',
  capability_refs JSONB NOT NULL DEFAULT '[]'::JSONB,
  safety_flags JSONB NOT NULL DEFAULT '[]'::JSONB,
  before_state JSONB,
  after_state JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_session_memory_change_feed_session_cursor
  ON session_memory_change_feed (session_id, id);
```

### CouchDB change stream (replication view)
```json
{
  "_id": "_design/session_memory",
  "views": {
    "changes": {
      "map": "function (doc) { if (doc.type === 'session.memory.change') emit([doc.sessionId, doc.cursor], doc); }"
    }
  },
  "filters": {
    "by_session": "function (doc, req) { return doc.type === 'session.memory.change' && doc.sessionId === req.query.sessionId; }"
  }
}
```

## API Surface
All endpoints live under `/sessions/:sessionId/memory` and require optimistic locking via `expectedRevision`.

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/sessions/:sessionId/memory` | Return shard metadata, latest cursors, capability references. |
| `GET` | `/sessions/:sessionId/memory/:shard` | Fetch a specific shard (`character`, `inventory`, `relationships`, `momentum`). |
| `PUT` | `/sessions/:sessionId/memory/:shard` | Replace shard data with optimistic locking and moderation validation. |
| `GET` | `/sessions/:sessionId/memory/changes?since={cursor}&limit=50` | Stream change feed for offline replication. |
| `POST` | `/sessions/:sessionId/memory/ack` | Acknowledge change feed consumption to clear `pendingOfflineReconcile`. |
| `GET` | `/sessions/:sessionId/memory/capabilities` | Enumerate capability references accumulated during the session. |

Example request:
```bash
curl -X PUT http://localhost:3000/sessions/demo-session/memory/character \
  -H "Content-Type: application/json" \
  -d '{
    "expectedRevision": 1,
    "reason": "LangGraph node: advance arc",
    "capabilityRefs": [{"capabilityId":"capability.spectrum-bloom-array","severity":"critical"}],
    "data": {
      "name": "Avery Glass",
      "stats": { "ingenuity": 2, "resolve": 1, "finesse": 2, "presence": 1, "weird": 0, "grit": 1 },
      "tags": ["region.auric-steppe", "faction.prismwell-kite-guild", "anchor.prism-spire.auric-step"]
    }
  }'
```

## Change Feed & Offline Integration
- Every shard mutation appends a change entry with monotonic `cursor`, `revision`, `scope=ephemeral`, and provenance metadata for Temporal workflows.
- Offline pipelines poll `/memory/changes` with `since` cursors, then call `/memory/ack` to set `lastAckCursor`, flipping `pendingOfflineReconcile` to false.
- `SessionMemoryFacade.listChanges` caps the buffer to the latest 500 entries to bound memory footprint; CouchDB replication persists the full feed.

## Moderation & Safety Hooks
- Capability enforcement lives in `src/moderation/prohibitedCapabilitiesRegistry.js`, seeded with WORLD_BIBLE triggers like Spectrum Bloom, Temporal Retcons, and Spectrumless legends.
- `validateCapabilityRefs` cross-checks incoming references and rejects mismatched severities or unknown capability IDs before state commits.
- Change feed events mirror `capabilityRefs` and `safetyFlags` so moderation dashboards inherit context.
- Mid-session canonical writes are blocked (`canonical_write_not_allowed`) to uphold the “no live canon mutations” rule.

## Seed Data (WORLD_BIBLE Alignment)
`SessionMemoryFacade` boots sessions with Day-0 context:
```json
{
  "character": {
    "name": "Avery Glass",
    "archetype": "Wayfarer Archivist",
    "tags": [
      "region.auric-steppe",
      "faction.prismwell-kite-guild",
      "anchor.prism-spire.auric-step"
    ]
  },
  "inventory": [
    { "id": "item.glass-frontier-compass", "tags": ["narrative-anchor", "tech.tier.resonance"] },
    { "id": "item.echo-ledger-fragment", "tags": ["lore-hook", "faction.echo-ledger-conclave"] }
  ],
  "relationships": [
    { "id": "faction.cinder-scout-collective", "status": "guarded" },
    { "id": "faction.prismwell-kite-guild", "status": "trusted" }
  ],
  "momentum": { "current": 0, "floor": -2, "ceiling": 3, "baseline": 0 }
}
```
These align with WORLD_BIBLE regions, factions, and artefacts, providing immediate lore-consistent context for LangGraph memory prompts.

## Code Highlights
- `src/memory/sessionMemory.js`: Refactored facade with shard metadata, change feed, optimistic locking, capability aggregation, and moderation-aware updates.
- `src/moderation/prohibitedCapabilitiesRegistry.js`: Registry stub with validation helpers used by the memory service.
- `src/server/app.js`: REST endpoints for shard access, change feeds, and acknowledgements.
- `__tests__/integration/memory.api.test.js`: Integration coverage for optimistic locking, change feed mechanics, and capability enforcement.
- `package.json`: Jest now ignores Playwright E2E suites (`testPathIgnorePatterns`) so `npm test` runs cleanly.

## Verification
- `npm test` (Jest unit + integration) now includes memory API regression coverage.
- Existing check runner and narrative engine suites remain green, ensuring stat/momentum workflows still operate against the new facade.
- Playwright accessibility suites continue to run via `npm run test:accessibility`.

## Follow-ups
1. Implement LangGraph node clients consuming the new endpoints (`IMP-GM-04` candidate).
2. Wire change-feed replication jobs into the offline Temporal pipelines (ties to `IMP-OFFLINE-01/02`).
3. Expand moderation registry to pull dynamic capability entries once `IMP-MOD-02` lands.
4. Persist delta acknowledgements to PostgreSQL in future infrastructure work (Nomad/Temporal deployment).
