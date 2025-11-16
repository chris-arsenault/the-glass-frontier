# GM API – DTO & Persistence Gaps

Forward-looking notes captured while inspecting the LangGraph orchestrator, prompts, and nodes
against the new `@glass-frontier/worldstate` package.

## Chronicle / Intent Data
- **Chronicle beats**: LangGraph reads/writes `chronicle.beats[]`, `beatsEnabled`, `seedText`, and
  `targetEndTurn`, and persists new beat states via `upsertChronicle`. None of these exist on the
  v2 Chronicle DTO, nor is there a `ChronicleBeat` schema to serialize created/updated beats.
- **Intent fields**: The nodes depend on `intentType`, `beatDirective`, `creativeSpark`, the  
- but the v2 `IntentSchema` only exposes basic tone/skill
  info. Turn DTOs also embed intent, so both schemas must be updated together.
- remove fields `routerConfidence`, and `routerRationale` from the nodes, they are not useful.
- **Snapshot shape**: Prompt helpers expect `ChronicleState` to include `location: LocationSummary`
  and the latest `turnSequence`. `getChronicleSnapshot` currently returns `{ chronicle, character,
  turns }`, so the session layer needs to enrich snapshots with location summaries or the persistence
  API must expose a richer snapshot call.
- Update prompt helpers to use the existing knn neighbor serach for location summary instad of exisitng methods
- prompt helpers do not require the full turn history, only recent events, so chronicle state is fine.

## Character Progression
- `UpdateCharacterNode` calls `applyCharacterProgress` to adjust momentum and skill XP. v2 only
  offers `updateCharacter`, so we need an equivalent helper or API on `WorldStateStoreV2` that can
  atomically mutate progression fields in the same way.
- **move applycharacter progress logic inoto gm-api and use updatecharacter without adding new methods

## Location Graph Integration
- Location nodes rely on:
  - Fetching the complete location graph + prior `LocationState`. - only fetch KNN not entire graph
  - Applying a `LocationPlan` (create/move/connect places) and summarizing the character’s new anchor.
  - Accessing `LocationPlan`/`LocationPlace` DTOs (with canonical parent IDs, location IDs, etc.).
  The v2 store currently exposes chunked graph listings, neighbor summaries, and location events, but
  not the above operations or schemas. We need equivalents for `getLocationGraph`,
  `getLocationState`, `applyPlan`, and `getLocationSummary`, plus the `LocationPlan` DTO family.
  - rewrite the location nodes to work with the new store instead of creating new methods. attempt to simplify location logic as much as possible

## Chronicle Updates
- Multiple nodes persist changes by calling `worldStateStore.upsertChronicle`, e.g., to set beats or
  change status on closure. `WorldStateStoreV2` can create chronicles and append summaries, but lacks
  a generic update API. Add an `updateChronicle`/`patchChronicle` call so the session layer can write
  beat metadata and wrap targets without re-ingesting whole records.

Tracking these gaps up front keeps the gm-api rewrite aligned with the LangGraph pipeline while the
new DTOs and persistence methods are built out. Once filled, the orchestrator can map its effects to
v2 worldstate calls without reaching back into the legacy persistence package.
