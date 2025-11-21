# Location API Contract (Postgres worldstate)

This is the canonical surface area for location persistence and queries. Legacy methods remain for compatibility, but the contract below is what new callers should target.

## Core mutations
* `upsertLocation({ id?, name, kind, description?, tags?, biome?, parentId? }) -> LocationPlace`
  * Single table write plus `location_parent` edge if `parentId` is provided (unique per child).
* `deleteLocation({ id })`
  * Removes edges, typed row, and node row for the location.
* `upsertEdge({ src, dst, kind, metadata? })`
  * Writes a single edge between two location nodes.
* `deleteEdge({ src, dst, kind })`
  * Deletes one edge.

## Queries
* `listLocationRoots({ search?, limit? }) -> LocationPlace[]`
  * Returns canonical roots (no `location_parent` edge).
* `getLocationDetails({ id }) -> { place, breadcrumb, children, neighbors }`
  * `breadcrumb`: ancestor chain via `location_parent`.
  * `children`: recursive descendants.
  * `neighbors`: inbound/outbound edges with neighboring places.
* `getLocationChain({ anchorId }) -> LocationBreadcrumbEntry[]`
  * Ancestor chain for breadcrumbs.
* `getLocationNeighbors({ id, limit? }) -> { parent, children, siblings, adjacent, links }`
  * Returns canonical parent, direct children, siblings (shared parent), adjacent places, and link neighbors (dock/teleport).

## Events
* `appendLocationEvents`, `listLocationEvents` (unchanged).

## Legacy shims (to be removed)
* `getLocationGraph`, `applyPlan`, `ensureLocation`, `createPlace/updatePlace`, `addEdge/removeEdge`, `createLocationChain`, `summarizeCharacterLocation`, `getLocationState`.
* Used by existing GM/location flows; migrate to the core mutations/queries above before removing.
