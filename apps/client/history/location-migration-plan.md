# Location/Breadcrumb Migration Plan

## Objectives
- Move every location-facing UI (start wizard, player menu, moderation tools) to consume the worldstate v2 DTOs and APIs without relying on legacy graph stores.
- Keep breadcrumb displays consistent by sourcing them from shared schemas (`LocationSummary.breadcrumb`, `Character.locationState.breadcrumb`).
- Simplify mutations by leaning on the general-purpose worldstate neighbor + location event endpoints.

## Steps
1. **Replace DTO Imports**
   - Swap `@glass-frontier/dto` references in `locationMaintenanceStore`, `useLocationExplorer`, and related components with `@glass-frontier/worldstate` exports (`LocationSummary`, `LocationGraphChunk`, `LocationBreadcrumbEntry`, `LocationNeighborSummary`, `LocationEdgeKind`).
2. **TRPC Client Updates**
   - Ensure `locationClient` calls endpoints that proxy `WorldStateStoreV2` methods (`listLocations`, `getLocation`, `listLocationGraph`, `addLocationNeighborEdge`, `removeLocationNeighborEdge`, `appendLocationEvents`).
   - Return typed responses so hooks/components inherit the new schemas automatically.
3. **Explorer & Wizard Flow**
   - Rework `useLocationExplorer` to page through graph chunks (`listLocationGraph`) instead of fetching entire snapshots; build a place cache keyed by `locationId:placeId`.
   - When inspecting a place, fetch details via a backend helper that resolves `{ place, breadcrumb }` using worldstate neighbor lookups; retire client-side traversal code.
   - Update `bootstrapShardLocation` to call a worldstate-aware mutation that resolves/creates missing segments server-side.
4. **Breadcrumb Rendering**
   - Player menu, overview cards, wizards, and moderation dialogs should all render breadcrumbs from `LocationBreadcrumbEntry[]` returned by the location summary or the character’s `locationState`.
   - Remove redundant breadcrumb DTOs and text transformations beyond formatting for display.
5. **Moderation Tools**
   - Relationship dialogs should invoke `addLocationNeighborEdge` / `removeLocationNeighborEdge` with `LocationPlace` payloads from cached graph chunks.
   - Quick edits should call a general-purpose `updateLocation` mutation rather than bespoke edge/description helpers; log changes via `appendLocationEvents`.
6. **Testing & Validation**
   - Exercise the chronicle start wizard, moderation location maintenance page, and player menu navigation to confirm breadcrumbs and graph interactions still work.
   - Add regression coverage in manual/Playwright passes for relationship add/remove, child creation, inspector breadcrumb display, and shard bootstrap.

## Notes
- Location getters should remain lightweight: rely on `listLocations` for summaries and only fetch detailed graph chunks on demand.
- Store only identifiers when referencing other services; location metadata itself must come from worldstate.
