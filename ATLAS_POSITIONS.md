# Accurate placement for the Atlas charts

> **Status:** superseded by canon. tsonu-canon now declares `spatial_frame`,
> per-entity `position` (polar in orbit ranks, or surface latitude/longitude
> with size classes), typed relation properties (`adjacent_to` bearings), and
> `route_geometry` on routes. The importer carries these through `entity.props`
> and `edge.props`, and the Atlas charts render from them, keeping the
> inference below as the fallback for undeclared entities. The analysis is
> kept for the reasoning behind the fallback rules.

The Atlas charts without declared geometry are inferred, not declared. Planets get positions from
`orbits` edges plus the `inner_of` ordering chain; everything below that is
hung off a spatial parent and then laid out by convention: surface regions
stack top-to-bottom on the planet's limb in alphabetical order, orbital
objects are spaced evenly on generic tracks, ring habs are distributed
evenly along their ring's arc, and route hubs sit at even fractions of the
lane. Every one of those spacings is presentational. This note lists the
attributes that would make each layer positionally true.

## Surface placement

Where a region or settlement sits on the body. Position exists today only in
prose ("coastal hills above Glasswake", "west of the Old Campus"), which the
renderer cannot read. Two tiers, cheapest first:

- **Relative geography (schematic accuracy).** An `adjacent_to` relation
  between surface places, with edge props `bearingDeg` (0–360 in the body
  frame) and optionally `distanceKm`. The chart can then solve a constrained
  layout: neighbors near each other, bearings respected, instead of an
  alphabetical stack. This matches how the source already writes geography
  and degrades gracefully when only some edges carry props.
- **True coordinates (projective accuracy).** `latDeg` / `lonDeg` props on
  the `on_surface_of` (or `located_in`) edge, plus one per-body fact naming
  the reference meridian (e.g. `prime_meridian: "Sithari"`). This is what a
  real globe or orthographic limb view needs — the current limb chart could
  project only the visible hemisphere and grey out the far side.
- **Extent.** Regions additionally need a size to stop rendering as points:
  a `radiusKm` (or a coarse `sizeClass`) is enough for a schematic map.
  Actual coastlines/terrain are artwork, not graph attributes, and should
  stay out of canon.

## Orbital placement

Where an object sits around its body. Two independent axes:

- **Radial order (which track).** Cheapest fix reuses existing vocabulary:
  the `inner_of` verb is already generic ("subject lies inward of target")
  and today is only authored between planets. Authoring it between
  co-orbiting stations gives correct track ordering with zero new schema.
  For numeric truth, an `altitudeBand` (`low` | `ring` | `synchronous` |
  `high`) or `radiusKm` prop on the `in_orbit_of` edge replaces the band
  heuristics (today "rides the ring" is inferred from a `located_in` edge to
  a ring region).
- **Angular position (where on the track).** A `phaseDeg` prop on the
  `in_orbit_of` edge — for ring habs this doubles as position along the ring
  arc, so Fermata, Verathi, and Xyloathax would sit where they actually are
  on the Glass Frontier rather than at even intervals. Motion would further
  need `epoch` + `periodHours`, but a static schematic does not.
- `inclinationDeg` only if polar or shear-crossing orbits ever need to read
  differently; nothing in current canon calls for it.

## Off-body placements (for completeness)

- **Lagrange stations** — a narrow `at_lagrange_of` relation (or a `point:
  L1–L5` prop on the orbit edge) naming the body pair, so Threshold Station
  stops being inferred from its span link.
- **Route hubs** — a `fraction` (0–1) prop on the hub's `located_in` edge to
  its route, plus an ordered terminus list on the route (today `terminus_of`
  edges carry no sequence).
- **Free-floaters** — system-frame polar facts: `radius_au`, `bearing_deg`.

## Where the attributes live

Both homes already exist, so no schema migration is needed: relational
placements are jsonb props on the `edge` table (which already carries
`since`/`until`/`strength`), and per-body constants or free coordinates are
fact-card keys on the entity. tsonu-canon is the source of truth, so the
declarations belong in the source schema first and mirror into
`packages/dto/src/world/vocabulary.ts`, the same path `attuned_to` took. The
only consumers that change are `atlasGraph` and the two chart components:
prefer declared placement when present, keep today's inference as fallback.
