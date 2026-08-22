# Accurate map positions for non-orbital bodies

The Atlas charts today are inferred, not declared. Planets get positions from
`orbits` edges plus the `inner_of` ordering chain; everything else is hung off
a spatial parent (`on_surface_of` > `in_orbit_of` > `orbits` > `located_in` >
`part_of`) and placed presentationally. That works for satellites, but three
classes of object have no honest position in the data:

- **Lagrange stations** — Threshold Station is `in_orbit_of Kaleidos`; that it
  sits at a Lagrange point exists only in description prose. The renderer
  infers "tethered" from its single `terminus_of` link, which is a proxy, not
  a position.
- **Route hubs** — Cold Lantern, Hinge Six, and Latchhouse are `located_in
  The Keel`. The chart spaces them evenly because nothing says where along
  the lane they sit, or in what order.
- **Free-floating objects** — anything not orbiting a body (a deep-field
  wreck, a drifting hab) has nowhere to go but the parent fallback.

## Attributes that would make positions accurate

The map is schematic, so full ephemerides are overkill. Three declarations
cover every case; each names a *frame*, a *kind*, and *parameters*.

| Attribute | Values | Meaning |
| --- | --- | --- |
| `placementFrame` | entity ref, or ordered pair of refs | What the position is measured against: a body, a body pair (for Lagrange points), or a route |
| `placementKind` | `orbit` \| `lagrange` \| `route` \| `free` | Which parameter set applies |
| `placementParams` | see below | The numbers |

Per kind:

- `orbit` — `phaseDeg` (0–360 along the orbit) and optionally `band`
  (`low` \| `ring` \| `high`), replacing the current even-spacing and the
  located-in-ring heuristic.
- `lagrange` — `point` (`L1`–`L5`) with `placementFrame` naming the pair,
  e.g. (Kaleidos, The Sun). The renderer can then draw the station at the
  correct fifth-point of the correct pair instead of on a generic track.
- `route` — `fraction` (0–1 from the route's first terminus) plus an ordered
  terminus list on the route itself (today `terminus_of` edges carry no
  sequence, so even endpoint order is arbitrary).
- `free` — polar coordinates in the system frame: `radiusAu` and `bearingDeg`
  (and `inclinationDeg` only if a z-axis ever matters). This is the one case
  that needs real coordinates.

## Where they would live

Two homes already exist in the model, so no schema migration is required:

1. **Edge props** for relational placements. The `edge` table already stores
   a `props` jsonb (surfaced today for `since`/`until`/`strength`). A
   placement relative to a parent is a property of that relationship:
   `in_orbit_of {phaseDeg, band}`, `located_in <route> {fraction}`, and a new
   narrow verb `at_lagrange_of {point}` whose src is the station and dst the
   primary body (the pair's secondary can be an explicit second edge or a
   prop). This keeps position exactly as authoritative as the relation that
   implies it.
2. **Fact cards** for free-floaters. `HardState.facts` is verbatim key/value
   from the source; `radius_au` / `bearing_deg` keys fit its existing shape
   ("Born", "Population") and need no game-side change beyond the renderer
   reading them.

Since tsonu-canon is the source of truth, the declarations belong in the
source schema first (`craft/schema/base.rb` relation props, world fact-card
conventions) and mirror into `packages/dto/src/world/vocabulary.ts` the same
way `attuned_to` and the DM edges did. The ingest path already carries edge
props and facts verbatim, so the client-side `atlasGraph` and the two chart
components are the only consumers that change: prefer declared placement when
present, keep today's inference as the fallback for undeclared entities.
