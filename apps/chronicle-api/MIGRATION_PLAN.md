# Chronicle API → Worldstate v2 Migration Plan

## 1. Replace Persistence Wiring
- Swap `createWorldStateStore`/`LocationGraphStore` usages in `src/context.ts` with `@glass-frontier/worldstate` factories and keep only the non-worldstate helpers (`PromptTemplateManager`, `BugReportStore`, `TokenUsageStore`, imbued registry).
- Add the worldstate package dependency + TS path aliases for `@glass-frontier/worldstate`. Decide where `Player` records live (lightweight helper vs temporary legacy shim).

## 2. Bring DTOs/Store to Feature Parity
- Extend v2 Chronicle DTOs with `targetEndTurn`, `beatsEnabled`, `beats`, `seedText`, and status values to cover open/closed flows. Provide `updateChronicle`, `deleteChronicle`, and status helpers so router + engine updates do not re-ingest records.
- Ensure `TurnSchema` covers every LangGraph field (GM trace, beat deltas, inventory/location deltas, handler metadata). Add a progress helper equivalent to `applyCharacterProgress` or move that logic into worldstate so `UpdateCharacterNode` can call a single API.

## 3. Align App Types With v2 DTOs
- Update `src/types.ts` so `ChronicleState`, `Turn`, `Character`, etc., import from `@glass-frontier/worldstate/dto`. Provide mapper functions that adapt v2 DTOs to any legacy response shapes the router still returns.

## 4. Build a Worldstate Session Adapter
- Create a helper (e.g., `services/worldstateSession.ts`) that wraps the v2 store for common flows: ensure chronicle, load enriched snapshots (`getChronicleSnapshot` + location summaries), paginate characters/chronicles, seed locations, and append turns.
- Encapsulate location helpers (`createLocation`, `listLocationGraph`, neighbor lookups, location-state updates) so nodes and router call one abstraction.

## 5. Refactor the Router
- `createCharacter`, `createChronicle`, `deleteChronicle`, `setChronicleTargetEnd`, `postMessage`, bug report helpers, and settings endpoints should call the new session adapter instead of the legacy store. Replace Playwright fixture seeding with worldstate APIs.

## 6. Refactor Narrative Engine + LangGraph
- Load chronicle state via the session adapter, enriching snapshots with location summaries and metadata needed by prompts.
- Emit v2 `Turn` objects (including `characterId`, `loginId`, `createdAt`, `locationContext/delta`) before calling `appendTurn`.
- Replace direct `LocationGraphStore` touches in nodes with worldstate calls (`updateLocationState`, `appendLocationEvents`, neighbor writer). Keep `resolveInventoryDelta`, but persist through `worldstate.updateCharacter`/progress helpers.

## 7. Update Supporting Services
- Chronicle seed service should source breadcrumb/tag data through worldstate (locations + neighbor summaries) instead of the legacy graph store.
- Playwright fixtures and tests must ingest data using the new package; mocks in `langGraph/nodes/__tests__` need in-memory v2 store doubles.

## 8. Testing + Changelog
- Run unit/e2e suites plus manual smoke tests (chronicle creation, turn processing, closure). Add a changelog entry in `apps/client/src/data/changelog.json` describing the Chronicle API migration and verify no lingering imports from `@glass-frontier/persistence` remain (besides template/imbued helpers).
