import type { HardState } from '@glass-frontier/dto';
import React, { useMemo } from 'react';

import type { AtlasGraph, AtlasNode } from './atlasGraph';
import { descendantCount, isTetheredEndpoint, terminusPartnerIds } from './atlasGraph';
import type { PolarPoint, SurfacePoint } from './atlasPositions';
import {
  AtlasPositionResolver,
  hasOwnPolarPosition,
  localOffset,
  surfacePoint,
  toCartesian,
} from './atlasPositions';

/**
 * The close-orbit chart for a heavily settled body. When canon declares fixed
 * spatial geometry, this renders two true panels: a surface map from
 * latitude/longitude (with adjacency edges and size classes) and a top-down
 * orbital view from the authored polar offsets, with route geometry drawn
 * through it and the sunward direction marked. Bodies without declared
 * positions keep the inferred limb layout. Only drawn for bodies that have
 * both a surface and an orbital layer; lesser bodies stay with plain tiles.
 */
type AtlasBodyMapProps = {
  graph: AtlasGraph;
  body: AtlasNode;
  resolve: (id: string) => HardState | undefined;
  onOpen: (slug: string) => void;
  /** Entity to render with the chosen-location ring (picker mode). */
  selectedId?: string | null;
};

const VIEW_WIDTH = 1200;
const VIEW_HEIGHT = 470;

/** Planet disc center sits far off-canvas so only its limb shows. */
const PLANET_X = -640;
const PLANET_Y = VIEW_HEIGHT / 2;
const PLANET_R = 880;

const LIMB_X = PLANET_X + PLANET_R;

/** Place a point on a circle around the planet center at a vertical spread. */
const onArc = (radius: number, spread: number): { x: number; y: number } => {
  const angle = Math.asin((spread * (VIEW_HEIGHT / 2 - 64)) / radius);
  return {
    x: PLANET_X + radius * Math.cos(angle),
    y: PLANET_Y + radius * Math.sin(angle),
  };
};

/** Even offsets in (-1, 1) for n items, top to bottom. */
const spreads = (count: number): number[] => {
  if (count === 1) {
    return [0];
  }
  return Array.from({ length: count }, (_, index) => (index / (count - 1)) * 2 - 1);
};

const arcPath = (radius: number): string => {
  const top = onArc(radius, -1);
  const bottom = onArc(radius, 1);
  return `M ${top.x} ${top.y} A ${radius} ${radius} 0 0 1 ${bottom.x} ${bottom.y}`;
};

type OrbitLayers = {
  rings: AtlasNode[];
  routes: AtlasNode[];
  tethered: AtlasNode[];
  satellites: AtlasNode[];
  /** hab id → index of the ring it rides, for placing habs on their arc. */
  ringRiderIndex: Map<string, number>;
};

const layerOrbit = (graph: AtlasGraph, body: AtlasNode): OrbitLayers => {
  const orbitNodes = body.children.orbit
    .map((id) => graph.nodes.get(id))
    .filter((node): node is AtlasNode => Boolean(node));
  const rings = orbitNodes.filter((node) => node.entity.kind === 'geographic_location');
  const ringIndexById = new Map(rings.map((ring, index) => [ring.entity.id, index]));
  const rest = orbitNodes.filter((node) => node.entity.kind !== 'geographic_location');
  const routes = rest.filter((node) => terminusPartnerIds(node).length >= 2);
  const nonRoutes = rest.filter((node) => terminusPartnerIds(node).length < 2);
  const tethered = nonRoutes.filter((node) => isTetheredEndpoint(node));
  const satellites = nonRoutes.filter((node) => !isTetheredEndpoint(node));

  // A station that is also located in a ring rides that ring's arc.
  const ringRiderIndex = new Map<string, number>();
  for (const node of [...satellites, ...tethered]) {
    const ridden = node.entity.links.find(
      (link) =>
        link.direction === 'out' &&
        (link.relationship === 'located_in' || link.relationship === 'part_of') &&
        ringIndexById.has(link.targetId)
    );
    if (ridden) {
      ringRiderIndex.set(node.entity.id, ringIndexById.get(ridden.targetId) ?? 0);
    }
  }
  return { ringRiderIndex, rings, routes, satellites, tethered };
};

export function AtlasBodyMap({
  body,
  graph,
  onOpen,
  resolve,
  selectedId = null,
}: AtlasBodyMapProps): React.JSX.Element {
  const resolver = useMemo(() => new AtlasPositionResolver(graph), [graph]);
  const bodyPolar = resolver.resolvePolar(body.entity.id);
  if (bodyPolar !== null && body.children.orbit.length > 0) {
    return (
      <DeclaredBodyMap
        body={body}
        bodyPolar={bodyPolar}
        graph={graph}
        onOpen={onOpen}
        resolver={resolver}
        selectedId={selectedId}
      />
    );
  }
  return (
    <InferredBodyMap
      body={body}
      graph={graph}
      onOpen={onOpen}
      resolve={resolve}
      selectedId={selectedId}
    />
  );
}

function InferredBodyMap({
  body,
  graph,
  onOpen,
  resolve,
  selectedId,
}: AtlasBodyMapProps): React.JSX.Element {
  const layers = layerOrbit(graph, body);
  const surfaceNodes = body.children.surface
    .map((id) => graph.nodes.get(id))
    .filter((node): node is AtlasNode => Boolean(node));

  const ringRadius = (index: number): number => PLANET_R + 260 + index * 120;
  const lowOrbitRadius = PLANET_R + 130;

  const freeStations = [...layers.satellites, ...layers.tethered].filter(
    (node) => !layers.ringRiderIndex.has(node.entity.id)
  );
  const ringRiders = [...layers.satellites, ...layers.tethered].filter((node) =>
    layers.ringRiderIndex.has(node.entity.id)
  );

  const { clickable } = chartInteraction(onOpen, selectedId);

  return (
    <svg
      className="atlas-map atlas-bodymap"
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      role="img"
      aria-label={`Orbit and surface of ${body.entity.name}`}
    >
      {/* Planet limb and surface */}
      <circle className="atlas-bodymap-planet" cx={PLANET_X} cy={PLANET_Y} r={PLANET_R} />
      <text className="atlas-bodymap-planet-name" x={28} y={40}>
        {body.entity.name}
      </text>
      <text className="atlas-bodymap-layer-label" x={28} y={62}>
        surface
      </text>
      {surfaceNodes.map((node, index) => {
        const spread = spreads(surfaceNodes.length)[index] ?? 0;
        const point = onArc(PLANET_R - 6, spread * 0.9);
        const charted = descendantCount(graph, node.entity.id);
        return (
          <g key={node.entity.id} {...clickable(node)}>
            <title>
              {`${node.entity.name}${charted > 0 ? ` — ${charted} charted` : ''}`}
            </title>
            <circle className="atlas-bodymap-surface-dot" cx={point.x} cy={point.y} r={4.5} />
            <text
              className="atlas-map-name atlas-bodymap-surface-name"
              x={point.x - 14}
              y={point.y + 4}
              textAnchor="end"
            >
              {node.entity.name}
            </text>
          </g>
        );
      })}

      {/* Low-orbit track for free stations */}
      {freeStations.length > 0 ? (
        <path className="atlas-bodymap-track" d={arcPath(lowOrbitRadius)} />
      ) : null}
      {freeStations.map((node, index) => {
        const spread = spreads(freeStations.length)[index] ?? 0;
        const point = onArc(lowOrbitRadius, spread * 0.85);
        const tether = isTetheredEndpoint(node);
        const anchor = onArc(PLANET_R - 4, spread * 0.85);
        return (
          <g key={node.entity.id} {...clickable(node)}>
            <title>
              {`${node.entity.name}${tether ? ' — span-linked to the surface' : ''}`}
            </title>
            {tether ? (
              <line
                className="atlas-bodymap-tether"
                x1={anchor.x}
                y1={anchor.y}
                x2={point.x}
                y2={point.y}
              />
            ) : null}
            <circle
              className={`atlas-bodymap-station${tether ? ' atlas-bodymap-station-tethered' : ''}`}
              cx={point.x}
              cy={point.y}
              r={4.5}
            />
            <text className="atlas-map-name" x={point.x + 12} y={point.y + 4}>
              {node.entity.name}
            </text>
          </g>
        );
      })}

      {/* Ring regions and their riders */}
      {layers.rings.map((ring, index) => {
        const radius = ringRadius(index);
        const labelPoint = onArc(radius, 1);
        const labelY = labelPoint.y + 22 + (index % 2) * 22;
        const charted = descendantCount(graph, ring.entity.id);
        const riders = ringRiders.filter(
          (node) => layers.ringRiderIndex.get(node.entity.id) === index
        );
        return (
          <g key={ring.entity.id}>
            <g {...clickable(ring)}>
              <title>{`${ring.entity.name} — ${charted} charted`}</title>
              <path className="atlas-bodymap-ring" d={arcPath(radius)} />
              <text
                className="atlas-map-name atlas-bodymap-ring-name"
                x={labelPoint.x + 6}
                y={labelY}
              >
                {ring.entity.name}
                <tspan className="atlas-bodymap-ring-count"> · {charted} charted</tspan>
              </text>
            </g>
            {riders.map((rider, riderIndex) => {
              const spread = spreads(riders.length)[riderIndex] ?? 0;
              const point = onArc(radius, spread * 0.7 + 0.12);
              return (
                <g key={rider.entity.id} {...clickable(rider)}>
                  <title>{rider.entity.name}</title>
                  <circle
                    className="atlas-bodymap-station"
                    cx={point.x}
                    cy={point.y}
                    r={4}
                  />
                  <text className="atlas-map-name" x={point.x + 10} y={point.y + 4}>
                    {rider.entity.name}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}

      {/* Trade lanes and spans, with their mid-route hubs */}
      {layers.routes.map((route, index) => {
        const laneY = 58 + index * 46;
        const startX = LIMB_X + 30;
        const endX = VIEW_WIDTH - 40;
        const hubs = route.children.within
          .map((id) => graph.nodes.get(id))
          .filter((node): node is AtlasNode => Boolean(node));
        const termini = terminusPartnerIds(route)
          .map((id) => resolve(id)?.name)
          .filter((name): name is string => Boolean(name));
        return (
          <g key={route.entity.id}>
            <g {...clickable(route)}>
              <title>
                {`${route.entity.name}${termini.length > 0 ? ` — links ${termini.join(', ')}` : ''}`}
              </title>
              <line
                className="atlas-bodymap-lane"
                x1={startX}
                y1={laneY}
                x2={endX}
                y2={laneY}
              />
              <text className="atlas-map-name" x={startX} y={laneY - 10}>
                {route.entity.name}
              </text>
              {termini.length > 0 ? (
                <text className="atlas-map-count" x={endX} y={laneY - 10} textAnchor="end">
                  ⇢ {termini.join(' · ')}
                </text>
              ) : null}
            </g>
            {hubs.map((hub, hubIndex) => {
              const x =
                startX + ((hubIndex + 1) / (hubs.length + 1)) * (endX - startX);
              return (
                <g key={hub.entity.id} {...clickable(hub)}>
                  <title>{hub.entity.name}</title>
                  <circle className="atlas-bodymap-hub" cx={x} cy={laneY} r={4} />
                  <text
                    className="atlas-map-count atlas-bodymap-hub-name"
                    x={x}
                    y={laneY + 18}
                    textAnchor="middle"
                  >
                    {hub.entity.name}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------- */
/* Declared mode: true surface and orbital panels from authored geometry */
/* ------------------------------------------------------------------- */

const DECL_WIDTH = 1200;
const DECL_HEIGHT = 520;
const SURFACE_X = 24;
const SURFACE_Y = 84;
const SURFACE_W = 400;
const SURFACE_H = 396;
const ORBIT_CX = 812;
const ORBIT_CY = 282;
const ORBIT_MIN_R = 56;
const ORBIT_MAX_R = 214;
/** Vertical compression of the local orbital view. */
const ORBIT_FLATTEN = 0.74;

const SIZE_CLASS_RADIUS: Record<string, number> = {
  continent: 15,
  district: 6,
  region: 10,
  site: 4.5,
};

/** Shared click/keyboard affordances for chart glyphs. */
const chartInteraction = (onOpen: (slug: string) => void, selectedId?: string | null) => {
  const activate = (slug: string) => () => onOpen(slug);
  const keyActivate = (slug: string) => (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen(slug);
    }
  };
  const clickable = (node: AtlasNode) => ({
    'aria-label': node.entity.name,
    className: `atlas-map-body${node.entity.id === selectedId ? ' atlas-map-current' : ''}`,
    onClick: activate(node.entity.slug),
    onKeyDown: keyActivate(node.entity.slug),
    role: 'link',
    tabIndex: 0,
  });
  return { activate, clickable, keyActivate };
};

type SurfaceEntry = { node: AtlasNode; point: SurfacePoint };

/** Every descendant of the body that declares a surface position. */
const collectSurfaceEntries = (graph: AtlasGraph, body: AtlasNode): SurfaceEntry[] => {
  const entries: SurfaceEntry[] = [];
  const stack = [...body.children.surface, ...body.children.within, ...body.children.orbit];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    const node = graph.nodes.get(id);
    if (!node) {
      continue;
    }
    const point = surfacePoint(node.entity);
    if (point !== null) {
      entries.push({ node, point });
    }
    stack.push(...node.children.surface, ...node.children.within, ...node.children.orbit);
  }
  // North-to-south render order so alternating label sides separates neighbors.
  return entries.sort(
    (a, b) =>
      b.point.latitudeDeg - a.point.latitudeDeg ||
      a.point.longitudeDeg - b.point.longitudeDeg ||
      a.node.entity.name.localeCompare(b.node.entity.name)
  );
};

type DeclaredBodyMapProps = {
  graph: AtlasGraph;
  body: AtlasNode;
  bodyPolar: PolarPoint;
  resolver: AtlasPositionResolver;
  onOpen: (slug: string) => void;
  selectedId?: string | null;
};

function DeclaredBodyMap({
  body,
  bodyPolar,
  graph,
  onOpen,
  resolver,
  selectedId,
}: DeclaredBodyMapProps): React.JSX.Element {
  const { clickable } = chartInteraction(onOpen, selectedId);

  /* Surface panel: equirectangular, north up, equal degree scale. */
  const surfaceEntries = collectSurfaceEntries(graph, body);
  const lons = surfaceEntries.map((entry) => entry.point.longitudeDeg);
  const lats = surfaceEntries.map((entry) => entry.point.latitudeDeg);
  const lonMin = Math.min(...lons, 0) - 8;
  const lonMax = Math.max(...lons, 0) + 8;
  const latMin = Math.min(...lats, 0) - 8;
  const latMax = Math.max(...lats, 0) + 8;
  const degScale = Math.min(SURFACE_W / (lonMax - lonMin), SURFACE_H / (latMax - latMin));
  const surfaceOriginX = SURFACE_X + (SURFACE_W - (lonMax - lonMin) * degScale) / 2;
  const surfaceOriginY = SURFACE_Y + (SURFACE_H + (latMax - latMin) * degScale) / 2;
  const surfaceScreen = (point: SurfacePoint): { x: number; y: number } => ({
    x: surfaceOriginX + (point.longitudeDeg - lonMin) * degScale,
    y: surfaceOriginY - (point.latitudeDeg - latMin) * degScale,
  });
  const surfaceById = new Map(surfaceEntries.map((entry) => [entry.node.entity.id, entry]));
  const adjacency = surfaceEntries.flatMap((entry) =>
    entry.node.entity.links
      .filter(
        (link) =>
          link.relationship === 'adjacent_to' &&
          link.direction === 'out' &&
          surfaceById.has(link.targetId)
      )
      .map((link) => ({
        from: surfaceScreen(entry.point),
        to: surfaceScreen((surfaceById.get(link.targetId) as SurfaceEntry).point),
      }))
  );
  const graticule: number[] = [];
  for (let lon = Math.ceil(lonMin / 20) * 20; lon <= lonMax; lon += 20) {
    graticule.push(lon);
  }

  /* Orbital panel: top-down local view in authored offsets. */
  const hasSurface = surfaceEntries.length > 0;
  const orbitCx = hasSurface ? ORBIT_CX : DECL_WIDTH / 2;
  const orbitMaxR = hasSurface ? ORBIT_MAX_R : ORBIT_MAX_R + 44;

  // Every positioned, non-surface object in this body's subtree: direct
  // satellites, ring regions, zones, and mid-route hubs alike.
  const subtreeIds: string[] = [];
  {
    const stack = [...body.children.orbit, ...body.children.within];
    const seen = new Set<string>();
    while (stack.length > 0) {
      const id = stack.pop() as string;
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      subtreeIds.push(id);
      const node = graph.nodes.get(id);
      if (node) {
        stack.push(...node.children.orbit, ...node.children.within);
      }
    }
  }
  const positioned = subtreeIds.flatMap((id) => {
    const node = graph.nodes.get(id);
    if (!node || !hasOwnPolarPosition(node.entity) || surfacePoint(node.entity) !== null) {
      return [];
    }
    const polar = resolver.resolvePolar(id);
    if (polar === null) {
      return [];
    }
    return [{ delta: localOffset(bodyPolar, polar), node }];
  });
  const rings = positioned.filter(
    (item) =>
      item.node.entity.kind === 'geographic_location' &&
      item.node.entity.subkind === 'world_region'
  );
  const zones = positioned.filter(
    (item) =>
      item.node.entity.kind === 'geographic_location' &&
      item.node.entity.subkind !== 'world_region'
  );
  const stations = positioned.filter(
    (item) => item.node.entity.kind !== 'geographic_location'
  );

  const maxDistance = Math.max(...positioned.map((item) => item.delta.distance), 0.2);
  const orbitRadiusPx = (distance: number): number =>
    ORBIT_MIN_R + (orbitMaxR - ORBIT_MIN_R) * Math.sqrt(distance / maxDistance);
  const orbitScreen = (delta: { x: number; y: number; distance: number }): { x: number; y: number } => {
    const r = orbitRadiusPx(delta.distance);
    return {
      x: orbitCx + (delta.x / delta.distance) * r,
      y: ORBIT_CY - (delta.y / delta.distance) * r * ORBIT_FLATTEN,
    };
  };
  /** A point on the flattened ellipse of a track, at a bearing in degrees. */
  const onTrack = (radiusPx: number, bearingDeg: number): { x: number; y: number } => {
    const radians = (bearingDeg * Math.PI) / 180;
    return {
      x: orbitCx + Math.cos(radians) * radiusPx,
      y: ORBIT_CY - Math.sin(radians) * radiusPx * ORBIT_FLATTEN,
    };
  };
  const bearingOf = (delta: { x: number; y: number }): number =>
    (Math.atan2(delta.y, delta.x) * 180) / Math.PI;
  const trackDistances = [
    ...new Set(stations.map((item) => Number(item.delta.distance.toFixed(3)))),
  ].sort((a, b) => a - b);

  // The habs of each ring have no authored positions yet; string them evenly
  // along the ring's band so all of them are visible and clickable.
  const ringHabs = rings.flatMap((ring) => {
    const bandR = orbitRadiusPx(ring.delta.distance);
    const startBearing = bearingOf(ring.delta);
    const habs = ring.node.children.within
      .map((id) => graph.nodes.get(id))
      .filter(
        (hab): hab is AtlasNode => Boolean(hab) && !hasOwnPolarPosition((hab as AtlasNode).entity)
      );
    return habs.map((hab, index) => ({
      bandR,
      bearing: startBearing + ((index + 1) * 360) / (habs.length + 1),
      hab,
      index,
    }));
  });

  // Sunward: from the body toward the frame origin.
  const bodyCartesian = toCartesian(bodyPolar);
  const bodyDistance = Math.hypot(bodyCartesian.x, bodyCartesian.y) || 1;
  const sunward = {
    x: orbitCx - (bodyCartesian.x / bodyDistance) * (orbitMaxR + 34),
    y: ORBIT_CY + (bodyCartesian.y / bodyDistance) * (orbitMaxR + 34) * ORBIT_FLATTEN,
  };

  // Route geometry passing near this body, clipped to the panel's reach.
  const localRoutes = body.children.orbit.flatMap((childId) => {
    const child = graph.nodes.get(childId);
    const geometry = child?.entity.routeGeometry;
    if (!child || geometry === undefined) {
      return [];
    }
    const pointById = new Map(
      geometry.points.map((point) => [point.id, resolver.resolveRoutePoint(point)])
    );
    const segments = geometry.paths.flatMap((path) => {
      const projected = path.through.map((pointId) => {
        const polar = pointById.get(pointId) ?? null;
        if (polar === null) {
          return null;
        }
        const delta = localOffset(bodyPolar, polar);
        return delta.distance <= maxDistance * 1.3 && delta.distance > 0.001
          ? orbitScreen(delta)
          : null;
      });
      const runs: Array<Array<{ x: number; y: number }>> = [];
      let current: Array<{ x: number; y: number }> = [];
      for (const point of projected) {
        if (point === null) {
          if (current.length >= 2) {
            runs.push(current);
          }
          current = [];
        } else {
          current.push(point);
        }
      }
      if (current.length >= 2) {
        runs.push(current);
      }
      return runs.map((points, index) => ({ id: `${path.id}-${index}`, points }));
    });
    return segments.length > 0 ? [{ node: child, segments }] : [];
  });

  // Orbit children with no authored position ride a dashed outer track so
  // they stay visible on the chart instead of vanishing into a footnote.
  const unfixedTrackR = orbitMaxR + 30;
  const unfixed = body.children.orbit
    .flatMap((childId) => {
      const child = graph.nodes.get(childId);
      if (
        !child ||
        hasOwnPolarPosition(child.entity) ||
        child.entity.routeGeometry !== undefined
      ) {
        return [];
      }
      return [child];
    })
    .map((node, index, all) => ({
      node,
      point: onTrack(unfixedTrackR, -90 + ((index + 1) * 360) / (all.length + 1)),
    }));

  /** A band segment along a track: a sampled arc, wide enough to read as area. */
  const zoneArcPath = (radiusPx: number, centerBearing: number, halfSpanDeg: number): string => {
    const steps = 16;
    const points = Array.from({ length: steps + 1 }, (_, step) => {
      const bearing = centerBearing - halfSpanDeg + (2 * halfSpanDeg * step) / steps;
      return onTrack(radiusPx, bearing);
    });
    return `M ${points.map((point) => `${point.x} ${point.y}`).join(' L ')}`;
  };

  return (
    <svg
      className="atlas-map atlas-bodymap"
      viewBox={`0 0 ${DECL_WIDTH} ${DECL_HEIGHT}`}
      role="img"
      aria-label={`Surface and orbit of ${body.entity.name}`}
    >
      {hasSurface ? (
        <>
          {/* Surface panel */}
          <text className="atlas-bodymap-planet-name" x={SURFACE_X + 4} y={40}>
            {body.entity.name}
          </text>
          <text className="atlas-bodymap-layer-label" x={SURFACE_X + 4} y={62}>
            surface · charted coordinates
          </text>
          <rect
            className="atlas-bodymap-surface-frame"
            x={SURFACE_X}
            y={SURFACE_Y}
            width={SURFACE_W}
            height={SURFACE_H}
            rx={8}
          />
          {graticule.map((lon) => {
            const x = surfaceOriginX + (lon - lonMin) * degScale;
            return (
              <g key={`lon-${lon}`}>
                <line
                  className={`atlas-bodymap-graticule${lon === 0 ? ' atlas-bodymap-meridian' : ''}`}
                  x1={x}
                  y1={SURFACE_Y + 6}
                  x2={x}
                  y2={SURFACE_Y + SURFACE_H - 6}
                />
                <text
                  className="atlas-bodymap-graticule-label"
                  x={x}
                  y={SURFACE_Y + SURFACE_H - 10}
                  textAnchor="middle"
                >
                  {lon}°
                </text>
              </g>
            );
          })}
          <line
            className="atlas-bodymap-graticule atlas-bodymap-equator"
            x1={SURFACE_X + 6}
            y1={surfaceOriginY - (0 - latMin) * degScale}
            x2={SURFACE_X + SURFACE_W - 6}
            y2={surfaceOriginY - (0 - latMin) * degScale}
          />
          {adjacency.map((edge, index) => (
            <line
              key={`adj-${index}`}
              className="atlas-bodymap-adjacency"
              x1={edge.from.x}
              y1={edge.from.y}
              x2={edge.to.x}
              y2={edge.to.y}
            />
          ))}
          {surfaceEntries.map(({ node, point }, index) => {
            const screen = surfaceScreen(point);
            const radius = SIZE_CLASS_RADIUS[point.sizeClass ?? 'site'] ?? 4.5;
            const isRegion = point.sizeClass === 'region' || point.sizeClass === 'continent';
            const labelAbove = index % 2 === 0;
            return (
              <g key={node.entity.id} {...clickable(node)}>
                <title>{`${node.entity.name}${point.sizeClass ? ` — ${point.sizeClass}` : ''}`}</title>
                {isRegion ? (
                  <circle
                    className="atlas-bodymap-region-extent"
                    cx={screen.x}
                    cy={screen.y}
                    r={radius + 8}
                  />
                ) : null}
                <circle
                  className={isRegion ? 'atlas-bodymap-region-dot' : 'atlas-bodymap-surface-dot'}
                  cx={screen.x}
                  cy={screen.y}
                  r={isRegion ? radius * 0.55 : radius}
                />
                <text
                  className="atlas-map-name atlas-bodymap-surface-name"
                  x={screen.x}
                  y={labelAbove ? screen.y - radius - 8 : screen.y + radius + 18}
                  textAnchor="middle"
                >
                  {node.entity.name}
                </text>
              </g>
            );
          })}
        </>
      ) : (
        <text className="atlas-bodymap-planet-name" x={SURFACE_X + 4} y={40}>
          {body.entity.name}
        </text>
      )}

      {/* Orbital panel */}
      <text className="atlas-bodymap-layer-label" x={orbitCx} y={40} textAnchor="middle">
        orbit · authored offsets
      </text>
      {trackDistances.map((distance) => (
        <ellipse
          key={`track-${distance}`}
          className="atlas-bodymap-track"
          cx={orbitCx}
          cy={ORBIT_CY}
          rx={orbitRadiusPx(distance)}
          ry={orbitRadiusPx(distance) * ORBIT_FLATTEN}
        />
      ))}
      <line
        className="atlas-bodymap-sunline"
        x1={orbitCx}
        y1={ORBIT_CY}
        x2={sunward.x}
        y2={sunward.y}
      />
      <text className="atlas-bodymap-sun-glyph" x={sunward.x} y={sunward.y}>
        ☉
      </text>

      {/* Zones: band segments along their track, not point markers. */}
      {zones.map(({ delta, node }) => {
        const bearing = bearingOf(delta);
        const label = onTrack(orbitRadiusPx(delta.distance) + 16, bearing);
        const charted = descendantCount(graph, node.entity.id);
        return (
          <g key={node.entity.id} {...clickable(node)}>
            <title>{`${node.entity.name}${charted > 0 ? ` — ${charted} charted` : ''}`}</title>
            <path
              className="atlas-bodymap-zone-band"
              d={zoneArcPath(orbitRadiusPx(delta.distance), bearing, 26)}
            />
            <text
              className="atlas-map-name"
              x={label.x}
              y={label.y}
              textAnchor={label.x < orbitCx ? 'end' : 'start'}
            >
              {node.entity.name}
              {charted > 0 ? (
                <tspan className="atlas-bodymap-ring-count"> · {charted}</tspan>
              ) : null}
            </text>
          </g>
        );
      })}

      {/* Ring regions: the full band, with their habs strung along it. */}
      {rings.map(({ delta, node }) => {
        const bandR = orbitRadiusPx(delta.distance);
        const anchor = onTrack(bandR, bearingOf(delta));
        const charted = descendantCount(graph, node.entity.id);
        return (
          <g key={node.entity.id}>
            <g {...clickable(node)}>
              <title>{`${node.entity.name} — ${charted} charted`}</title>
              <ellipse
                className="atlas-bodymap-ring"
                cx={orbitCx}
                cy={ORBIT_CY}
                rx={bandR}
                ry={bandR * ORBIT_FLATTEN}
              />
              <circle className="atlas-bodymap-region-dot" cx={anchor.x} cy={anchor.y} r={3.5} />
              <text
                className="atlas-map-name"
                x={anchor.x + 10}
                y={anchor.y - 8}
              >
                {node.entity.name}
                <tspan className="atlas-bodymap-ring-count"> · {charted} charted</tspan>
              </text>
            </g>
          </g>
        );
      })}
      {ringHabs.map(({ bandR, bearing, hab, index }) => {
        const dot = onTrack(bandR, bearing);
        const label = onTrack(bandR + 12 + (index % 3) * 14, bearing);
        return (
          <g key={hab.entity.id} {...clickable(hab)}>
            <title>{hab.entity.name}</title>
            <circle className="atlas-bodymap-hab-dot" cx={dot.x} cy={dot.y} r={2.75} />
            <text
              className="atlas-bodymap-hab-name"
              x={label.x}
              y={label.y}
              textAnchor={label.x < orbitCx - 20 ? 'end' : label.x > orbitCx + 20 ? 'start' : 'middle'}
            >
              {hab.entity.name}
            </text>
          </g>
        );
      })}

      {localRoutes.map(({ node, segments }) => (
        <g key={node.entity.id} {...clickable(node)}>
          <title>{`${node.entity.name} — route`}</title>
          {segments.map((segment) => (
            <path
              key={segment.id}
              className="atlas-bodymap-lane"
              fill="none"
              d={`M ${segment.points.map((point) => `${point.x} ${point.y}`).join(' L ')}`}
            />
          ))}
          <text
            className="atlas-map-count atlas-bodymap-lane-name"
            x={(segments[0]?.points[0]?.x ?? orbitCx) + 8}
            y={(segments[0]?.points[0]?.y ?? ORBIT_CY) - 8}
          >
            {node.entity.name}
          </text>
        </g>
      ))}

      <circle className="atlas-bodymap-planet-dot" cx={orbitCx} cy={ORBIT_CY} r={22} />
      <text className="atlas-map-name" x={orbitCx} y={ORBIT_CY + 42} textAnchor="middle">
        {body.entity.name}
      </text>

      {stations.map(({ delta, node }) => {
        const screen = orbitScreen(delta);
        const tethered = isTetheredEndpoint(node);
        const charted = descendantCount(graph, node.entity.id);
        return (
          <g key={node.entity.id} {...clickable(node)}>
            <title>
              {`${node.entity.name}${charted > 0 ? ` — ${charted} charted` : ''}${tethered ? ' — span-linked' : ''}`}
            </title>
            <circle
              className={`atlas-bodymap-station${tethered ? ' atlas-bodymap-station-tethered' : ''}`}
              cx={screen.x}
              cy={screen.y}
              r={4.5}
            />
            <text className="atlas-map-name" x={screen.x + 10} y={screen.y + 4}>
              {node.entity.name}
              {charted > 0 ? (
                <tspan className="atlas-bodymap-ring-count"> · {charted}</tspan>
              ) : null}
            </text>
          </g>
        );
      })}

      {/* Unpositioned satellites ride a dashed outer track, still clickable. */}
      {unfixed.length > 0 ? (
        <ellipse
          className="atlas-bodymap-unfixed-track"
          cx={orbitCx}
          cy={ORBIT_CY}
          rx={unfixedTrackR}
          ry={unfixedTrackR * ORBIT_FLATTEN}
        />
      ) : null}
      {unfixed.map(({ node, point }) => {
        const charted = descendantCount(graph, node.entity.id);
        return (
          <g key={node.entity.id} {...clickable(node)}>
            <title>{`${node.entity.name} — position unrecorded`}</title>
            <rect
              className="atlas-bodymap-zone-marker"
              x={point.x - 4}
              y={point.y - 4}
              width={8}
              height={8}
              transform={`rotate(45 ${point.x} ${point.y})`}
            />
            <text className="atlas-map-name" x={point.x + 10} y={point.y + 4}>
              {node.entity.name}
              {charted > 0 ? (
                <tspan className="atlas-bodymap-ring-count"> · {charted}</tspan>
              ) : null}
            </text>
          </g>
        );
      })}
      {unfixed.length > 0 ? (
        <text
          className="atlas-bodymap-unplaced"
          x={orbitCx}
          y={DECL_HEIGHT - 12}
          textAnchor="middle"
        >
          dashed outer track: position unrecorded in canon
        </text>
      ) : null}
    </svg>
  );
}
