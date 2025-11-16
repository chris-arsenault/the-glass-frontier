# Worldstate v2 DTO Delta (Client Reference)

## Chronicles & Beats
- `ChronicleSummary` now includes `turnChunkCount`, `lastTurnPreview`, `heroArtUrl`, and richer statuses (`draft`, `active`, `paused`, `completed`, `archived`).
- Full `Chronicle` records embed `beatsEnabled`, `beats[]`, `summaries[]`, `seedText`, `targetEndTurn`, `locationId`, and `metadata`.
- Client components that show chronicle context (session header, wizard previews) must treat `seedText`, `locationId`, and `targetEndTurn` as optional.

## Turns, Intents, & Checks
- Shared enums exported from `packages/worldstate/src/dto/turn.ts`: `IntentType`, `RiskLevel`, `OutcomeTier`.
- `Intent` includes `beatDirective` and `handlerHints`; always surface `intentType` via worldstate’s enum rather than ad-hoc strings.
- `Turn` encapsulates `playerMessage`, optional `gmMessage`/`systemMessage`, `gmSummary`, `gmTrace`, `skillCheckPlan`, `skillCheckResult`, `inventoryDelta.ops`, `beatDelta`, `worldDeltaTags`, `locationContext`, `locationDelta`, `handlerId`.
- Transcript renderers should iterate over present entries and gracefully handle missing GM/system messages.

## Characters
- Character attributes/skills/inventory/momentum share canonical schemas; inventory now splits into `carried`, `stored`, `equipped`, `capacity`.
- `Character.echoes[]` replaces bespoke `character_bio` summaries—each entry holds `{ chronicleId, summary, createdAt, metadata }`.
- `locationState` carries `{ locationId, placeId, breadcrumb[], certainty, updatedAt }`, enabling breadcrumb UI reuse.

## Locations & Breadcrumbs
- `LocationSummary` adds `anchorPlaceId`, `breadcrumb[]`, node/edge/graph counts, and metadata fields.
- Graph data is chunked via `LocationGraphChunk` (places + edges per chunk) and manifest metadata; the client should cache chunk payloads instead of loading monolithic snapshots.
- `LocationNeighborSummary` normalizes neighbor exploration with `{ relationKind, depth, breadcrumb, tags }`.

## Shared Schemas
- `MetadataSchema` is a record of unknown values; `TagArraySchema` enforces non-empty string arrays.
- Inventory delta ops (`InventoryDeltaOp`) carry structured `op`/`amount`/`slot`/`bucket` info; replace freeform strings in badges and logs.

## Action Items for the Client
- Replace all enums/interfaces hand-rolled in the UI (`OutcomeTier`, `Intent`, `SkillCheckPlan`, etc.) with their worldstate counterparts.
- Ensure TRPC query/response types align with the schemas above to prevent silent drift.
- Update helper utilities (e.g., `flattenTurns`, `SkillCheckBadge`, `InventoryDeltaBadge`) to consume the canonical shapes.
