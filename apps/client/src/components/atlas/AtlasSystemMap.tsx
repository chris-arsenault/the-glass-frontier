import type { HardStateProminence } from '@glass-frontier/dto';
import React, { useMemo } from 'react';

import type { AtlasGraph, AtlasNode } from './atlasGraph';
import {
  descendantCount,
  planetAncestorId,
  routeIds,
  terminusPartnerIds,
} from './atlasGraph';
import type { PolarPoint } from './atlasPositions';
import { AtlasPositionResolver, hasOwnPolarPosition, localOffset } from './atlasPositions';

/**
 * The system chart on the atlas index. When canon declares fixed spatial
 * geometry (polar positions in orbit-rank units), the chart is a true
 * top-down view: the sun at center, one orbit ring per declared rank, every
 * body at its authored angle, moons beside their primaries, deep-space
 * objects as free markers, and routes drawn through their authored geometry.
 * Worlds without declared positions fall back to the inferred fan: orbit
 * order from `inner_of` edges, presentational spacing.
 */

type AtlasSystemMapProps = {
  graph: AtlasGraph;
  onSelect: (slug: string) => void;
};

const VIEW_WIDTH = 1200;
const VIEW_HEIGHT = 340;
const SUN_X = -210;
const SUN_Y = VIEW_HEIGHT / 2 - 20;
const FIRST_ORBIT = 330;
const ORBIT_GAP = 108;

/**
 * Vertical offsets per body, in view units rather than angles, so outer
 * orbits stay inside the chart instead of swinging off its top edge.
 */
const BODY_RISE = [0, -52, 44, -38, 58, -60, 30, -66, 48];

const PROMINENCE_RADIUS: Record<HardStateProminence, number> = {
  forgotten: 6,
  marginal: 7,
  mythic: 13,
  recognized: 9,
  renowned: 11,
};

const bodyAngle = (index: number, orbitRadius: number): number => {
  const rise = BODY_RISE[index % BODY_RISE.length] ?? 0;
  return Math.asin(rise / orbitRadius);
};

type Interactive = {
  activate: (slug: string) => () => void;
  keyActivate: (slug: string) => (event: React.KeyboardEvent) => void;
};

const useInteractive = (onSelect: (slug: string) => void): Interactive => ({
  activate: (slug: string) => () => onSelect(slug),
  keyActivate: (slug: string) => (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(slug);
    }
  },
});

export function AtlasSystemMap({ graph, onSelect }: AtlasSystemMapProps): React.JSX.Element {
  const resolver = useMemo(() => new AtlasPositionResolver(graph), [graph]);
  const declaredPlanetIds = graph.planetIds.filter((id) => {
    const node = graph.nodes.get(id);
    return node !== undefined && hasOwnPolarPosition(node.entity);
  });

  if (graph.sunId !== null && declaredPlanetIds.length >= 2) {
    return (
      <DeclaredSystemChart
        graph={graph}
        resolver={resolver}
        planetIds={declaredPlanetIds}
        onSelect={onSelect}
      />
    );
  }
  return <InferredSystemChart graph={graph} onSelect={onSelect} />;
}

/* ------------------------------------------------------------------ */
/* Declared mode: a real top-down chart from authored polar positions. */
/* ------------------------------------------------------------------ */

const TOP_WIDTH = 1200;
const TOP_HEIGHT = 620;
const TOP_CX = 600;
const TOP_CY = 316;
const RANK_STEP = 43;
/** Vertical compression: an oblique look that keeps labels legible. */
const FLATTEN = 0.52;

const toScreen = (point: PolarPoint): { x: number; y: number } => {
  const radians = (point.angleDeg * Math.PI) / 180;
  return {
    x: TOP_CX + Math.cos(radians) * point.radius * RANK_STEP,
    y: TOP_CY - Math.sin(radians) * point.radius * RANK_STEP * FLATTEN,
  };
};

type DeclaredSystemChartProps = {
  graph: AtlasGraph;
  resolver: AtlasPositionResolver;
  planetIds: string[];
  onSelect: (slug: string) => void;
};

function DeclaredSystemChart({
  graph,
  onSelect,
  planetIds,
  resolver,
}: DeclaredSystemChartProps): React.JSX.Element {
  const { activate, keyActivate } = useInteractive(onSelect);
  const sun = graph.sunId === null ? null : graph.nodes.get(graph.sunId) ?? null;
  const planetSet = new Set(planetIds);

  const planetPoints = new Map<string, { x: number; y: number }>();
  const ranks = new Set<number>();
  for (const planetId of planetIds) {
    const polar = resolver.resolvePolar(planetId);
    if (polar) {
      planetPoints.set(planetId, toScreen(polar));
      ranks.add(polar.radius);
    }
  }

  // Moons: orbit children of planets with their own declared position.
  const moons = planetIds.flatMap((planetId) => {
    const node = graph.nodes.get(planetId);
    if (!node) {
      return [];
    }
    return node.children.orbit.flatMap((childId) => {
      const child = graph.nodes.get(childId);
      if (
        !child ||
        child.entity.subkind !== 'celestial_body' ||
        !hasOwnPolarPosition(child.entity)
      ) {
        return [];
      }
      const polar = resolver.resolvePolar(childId);
      return polar === null ? [] : [{ node: child, point: toScreen(polar) }];
    });
  });
  const moonIds = new Set(moons.map((moon) => moon.node.entity.id));

  // Free objects: own polar position, not a planet/moon/sun, and far enough
  // from every planet to read at system scale (mid-route hubs, drift sites).
  const freeMarkers = [...graph.nodes.values()].flatMap((node) => {
    const id = node.entity.id;
    if (
      id === graph.sunId ||
      planetSet.has(id) ||
      moonIds.has(id) ||
      !hasOwnPolarPosition(node.entity)
    ) {
      return [];
    }
    const polar = resolver.resolvePolar(id);
    if (polar === null) {
      return [];
    }
    const separated = planetIds.every((planetId) => {
      const planetPolar = resolver.resolvePolar(planetId);
      return planetPolar === null || localOffset(planetPolar, polar).distance >= 0.3;
    });
    return separated ? [{ node, point: toScreen(polar) }] : [];
  });

  // Routes: authored geometry when present, a planet-pair curve otherwise.
  type ScreenPoint = { x: number; y: number };
  type RoutePolyline = {
    id: string;
    points: ScreenPoint[];
    curve?: { from: ScreenPoint; mid: ScreenPoint; to: ScreenPoint };
  };
  const routes = routeIds(graph).flatMap(
    (routeId): Array<{ node: AtlasNode; polylines: RoutePolyline[] }> => {
      const node = graph.nodes.get(routeId);
      if (!node) {
        return [];
      }
      const geometry = node.entity.routeGeometry;
      if (geometry !== undefined && geometry.paths.length > 0) {
        const pointById = new Map(
          geometry.points.map((point) => [point.id, resolver.resolveRoutePoint(point)])
        );
        const polylines: RoutePolyline[] = geometry.paths.flatMap((path) => {
          const points = path.through
            .map((pointId) => pointById.get(pointId) ?? null)
            .filter((polar): polar is PolarPoint => polar !== null)
            .map(toScreen);
          return points.length >= 2 ? [{ id: path.id, points }] : [];
        });
        return polylines.length > 0 ? [{ node, polylines }] : [];
      }
      const planets = [
        ...new Set(
          terminusPartnerIds(node)
            .map((endpointId) => planetAncestorId(graph, endpointId))
            .filter((id): id is string => id !== null)
        ),
      ];
      if (planets.length < 2) {
        return [];
      }
      const from = planetPoints.get(planets[0]);
      const to = planetPoints.get(planets[1]);
      if (!from || !to) {
        return [];
      }
      const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - 36 };
      return [{ node, polylines: [{ curve: { from, mid, to }, id: 'pair', points: [from, to] }] }];
    }
  );

  return (
    <svg
      className="atlas-map atlas-map-topdown"
      viewBox={`0 0 ${TOP_WIDTH} ${TOP_HEIGHT}`}
      role="img"
      aria-label={sun ? `The system around ${sun.entity.name}` : 'System chart'}
    >
      <defs>
        <radialGradient id="atlas-sun-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" className="atlas-sun-core" />
          <stop offset="55%" className="atlas-sun-mid" />
          <stop offset="100%" className="atlas-sun-edge" />
        </radialGradient>
      </defs>

      {[...ranks].sort((a, b) => a - b).map((rank) => (
        <ellipse
          key={`rank-${rank}`}
          className="atlas-map-orbit"
          cx={TOP_CX}
          cy={TOP_CY}
          rx={rank * RANK_STEP}
          ry={rank * RANK_STEP * FLATTEN}
        />
      ))}

      {sun ? (
        <g
          className="atlas-map-body atlas-map-sun"
          tabIndex={0}
          role="link"
          aria-label={sun.entity.name}
          onClick={activate(sun.entity.slug)}
          onKeyDown={keyActivate(sun.entity.slug)}
        >
          <title>{sun.entity.name}</title>
          <circle cx={TOP_CX} cy={TOP_CY} r={38} fill="url(#atlas-sun-glow)" />
          <circle className="atlas-map-sun-core-dot" cx={TOP_CX} cy={TOP_CY} r={7} />
          <text
            className="atlas-map-name atlas-map-sun-name"
            x={TOP_CX}
            y={TOP_CY + 20}
            textAnchor="middle"
          >
            {sun.entity.name}
          </text>
        </g>
      ) : null}

      {routes.map(({ node, polylines }) => {
        // Label the vertex farthest from every planet, out of the crowds.
        const clearance = (point: ScreenPoint): number =>
          Math.min(
            ...[...planetPoints.values()].map((planet) =>
              Math.hypot(planet.x - point.x, planet.y - point.y)
            )
          );
        const curveMid = polylines[0]?.curve?.mid;
        const bestVertex = [...polylines]
          .flatMap((line) => line.points)
          .sort((a, b) => clearance(b) - clearance(a))[0];
        // A route that hugs its bodies keeps only its hover title.
        const candidate = curveMid ?? bestVertex;
        const label = candidate !== undefined && clearance(candidate) >= 34 ? candidate : undefined;
        return (
          <g
            key={node.entity.id}
            className="atlas-map-body atlas-map-lane-group"
            tabIndex={0}
            role="link"
            aria-label={node.entity.name}
            onClick={activate(node.entity.slug)}
            onKeyDown={keyActivate(node.entity.slug)}
          >
            <title>{`${node.entity.name} — route`}</title>
            {polylines.map((line) =>
              line.curve ? (
                <path
                  key={line.id}
                  className="atlas-map-lane"
                  d={`M ${line.curve.from.x} ${line.curve.from.y} Q ${line.curve.mid.x} ${line.curve.mid.y} ${line.curve.to.x} ${line.curve.to.y}`}
                />
              ) : (
                <path
                  key={line.id}
                  className="atlas-map-lane"
                  d={`M ${line.points.map((point) => `${point.x} ${point.y}`).join(' L ')}`}
                />
              )
            )}
            {label ? (
              <text
                className="atlas-map-count atlas-map-lane-name"
                x={label.x + 8}
                y={label.y - 8}
              >
                {node.entity.name}
              </text>
            ) : null}
          </g>
        );
      })}

      {freeMarkers.map(({ node, point }) => (
        <g
          key={node.entity.id}
          className="atlas-map-body atlas-map-free"
          tabIndex={0}
          role="link"
          aria-label={node.entity.name}
          onClick={activate(node.entity.slug)}
          onKeyDown={keyActivate(node.entity.slug)}
        >
          <title>{node.entity.name}</title>
          <rect
            className="atlas-map-free-marker"
            x={point.x - 4}
            y={point.y - 4}
            width={8}
            height={8}
            transform={`rotate(45 ${point.x} ${point.y})`}
          />
          <text className="atlas-map-count" x={point.x} y={point.y + 19} textAnchor="middle">
            {node.entity.name}
          </text>
        </g>
      ))}

      {moons.map(({ node, point }) => (
        <g
          key={node.entity.id}
          className="atlas-map-body atlas-map-moon"
          tabIndex={0}
          role="link"
          aria-label={node.entity.name}
          onClick={activate(node.entity.slug)}
          onKeyDown={keyActivate(node.entity.slug)}
        >
          <title>{node.entity.name}</title>
          <circle className="atlas-map-moon-dot" cx={point.x} cy={point.y} r={3.5} />
          <text className="atlas-map-count" x={point.x + 8} y={point.y - 6}>
            {node.entity.name}
          </text>
        </g>
      ))}

      {planetIds.map((planetId) => {
        const node = graph.nodes.get(planetId);
        const point = planetPoints.get(planetId);
        if (!node || !point) {
          return null;
        }
        const radius = PROMINENCE_RADIUS[node.entity.prominence];
        const isHome = planetId === graph.homeId;
        const orbitChildren = node.children.orbit
          .map((id) => graph.nodes.get(id))
          .filter((child): child is AtlasNode => Boolean(child));
        const hasRing = orbitChildren.some(
          (child) => child.entity.subkind !== 'celestial_body'
        );
        const charted = descendantCount(graph, planetId);
        // Labels sit radially outward from the sun, away from the crowded center.
        const outX = point.x - TOP_CX;
        const outY = point.y - TOP_CY;
        const outLength = Math.hypot(outX, outY) || 1;
        const labelX = point.x + (outX / outLength) * (radius + 14);
        const labelY = point.y + (outY / outLength) * (radius + 14);
        const anchor = outX > 24 ? 'start' : outX < -24 ? 'end' : 'middle';
        const baseline = outY >= 0 ? 14 : -6;
        return (
          <g
            key={planetId}
            className={`atlas-map-body${isHome ? ' atlas-map-home' : ''}`}
            tabIndex={0}
            role="link"
            aria-label={node.entity.name}
            onClick={activate(node.entity.slug)}
            onKeyDown={keyActivate(node.entity.slug)}
          >
            <title>
              {`${node.entity.name}${charted > 0 ? ` — ${charted} charted ${charted === 1 ? 'place' : 'places'}` : ''}`}
            </title>
            {hasRing ? (
              <ellipse
                className="atlas-map-ring"
                cx={point.x}
                cy={point.y}
                rx={radius + 11}
                ry={(radius + 11) * 0.32}
                transform={`rotate(-24 ${point.x} ${point.y})`}
              />
            ) : null}
            <circle className="atlas-map-planet" cx={point.x} cy={point.y} r={radius} />
            {isHome ? (
              <circle className="atlas-map-home-halo" cx={point.x} cy={point.y} r={radius + 18} />
            ) : null}
            <text className="atlas-map-name" x={labelX} y={labelY + baseline} textAnchor={anchor}>
              {node.entity.name}
            </text>
            {charted > 0 ? (
              <text
                className="atlas-map-count"
                x={labelX}
                y={labelY + baseline + 17}
                textAnchor={anchor}
              >
                {charted} charted
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------- */
/* Inferred mode: the fan layout for worlds with no declared map. */
/* ------------------------------------------------------------- */

type InferredSystemChartProps = {
  graph: AtlasGraph;
  onSelect: (slug: string) => void;
};

function InferredSystemChart({ graph, onSelect }: InferredSystemChartProps): React.JSX.Element {
  const { activate, keyActivate } = useInteractive(onSelect);
  const sun = graph.sunId === null ? null : graph.nodes.get(graph.sunId) ?? null;
  const system = graph.systemId === null ? null : graph.nodes.get(graph.systemId) ?? null;

  if (sun === null) {
    // No celestial layer in this world graph: chart the root places instead.
    const roots = graph.rootIds
      .map((id) => graph.nodes.get(id))
      .filter((node): node is NonNullable<typeof node> => Boolean(node));
    return (
      <svg
        className="atlas-map"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        role="img"
        aria-label="Charted places"
      >
        {roots.map((node, index) => {
          const x = (VIEW_WIDTH / (roots.length + 1)) * (index + 1);
          const r = PROMINENCE_RADIUS[node.entity.prominence];
          return (
            <g
              key={node.entity.id}
              className="atlas-map-body"
              tabIndex={0}
              role="link"
              aria-label={node.entity.name}
              onClick={activate(node.entity.slug)}
              onKeyDown={keyActivate(node.entity.slug)}
            >
              <title>{node.entity.name}</title>
              <circle className="atlas-map-planet" cx={x} cy={SUN_Y} r={r} />
              <text className="atlas-map-name" x={x} y={SUN_Y + r + 22} textAnchor="middle">
                {node.entity.name}
              </text>
            </g>
          );
        })}
        {roots.length === 0 ? (
          <text className="atlas-map-empty" x={VIEW_WIDTH / 2} y={SUN_Y} textAnchor="middle">
            No charted places yet.
          </text>
        ) : null}
      </svg>
    );
  }

  const planetPositions = new Map<string, { x: number; y: number }>();
  for (const [index, planetId] of graph.planetIds.entries()) {
    const orbitRadius = FIRST_ORBIT + index * ORBIT_GAP;
    const angle = bodyAngle(index, orbitRadius);
    planetPositions.set(planetId, {
      x: SUN_X + orbitRadius * Math.cos(angle),
      y: SUN_Y + orbitRadius * Math.sin(angle),
    });
  }

  // Lanes that link places under two different planets draw between them.
  const lanes = routeIds(graph)
    .map((routeId) => {
      const node = graph.nodes.get(routeId);
      if (!node) {
        return null;
      }
      const planets = [
        ...new Set(
          terminusPartnerIds(node)
            .map((endpointId) => planetAncestorId(graph, endpointId))
            .filter((id): id is string => id !== null)
        ),
      ];
      if (planets.length < 2) {
        return null;
      }
      const from = planetPositions.get(planets[0]);
      const to = planetPositions.get(planets[1]);
      if (!from || !to) {
        return null;
      }
      return { from, node, to };
    })
    .filter((lane): lane is NonNullable<typeof lane> => lane !== null);

  return (
    <svg
      className="atlas-map"
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      role="img"
      aria-label={system?.entity.name ?? `Bodies orbiting ${sun.entity.name}`}
    >
      <defs>
        <radialGradient id="atlas-sun-glow-fan" cx="50%" cy="50%" r="50%">
          <stop offset="0%" className="atlas-sun-core" />
          <stop offset="55%" className="atlas-sun-mid" />
          <stop offset="100%" className="atlas-sun-edge" />
        </radialGradient>
      </defs>

      {graph.planetIds.map((_, index) => (
        <circle
          key={`orbit-${index}`}
          className="atlas-map-orbit"
          cx={SUN_X}
          cy={SUN_Y}
          r={FIRST_ORBIT + index * ORBIT_GAP}
        />
      ))}

      <g
        className="atlas-map-body atlas-map-sun"
        tabIndex={0}
        role="link"
        aria-label={sun.entity.name}
        onClick={activate(sun.entity.slug)}
        onKeyDown={keyActivate(sun.entity.slug)}
      >
        <title>{sun.entity.name}</title>
        <circle cx={SUN_X} cy={SUN_Y} r={240} fill="url(#atlas-sun-glow-fan)" />
        <text className="atlas-map-name atlas-map-sun-name" x={16} y={SUN_Y - 150}>
          {sun.entity.name}
        </text>
      </g>

      {lanes.map(({ from, node, to }) => {
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2 - 46;
        return (
          <g
            key={node.entity.id}
            className="atlas-map-body atlas-map-lane-group"
            tabIndex={0}
            role="link"
            aria-label={node.entity.name}
            onClick={activate(node.entity.slug)}
            onKeyDown={keyActivate(node.entity.slug)}
          >
            <title>{`${node.entity.name} — trade lane`}</title>
            <path
              className="atlas-map-lane"
              d={`M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`}
            />
            <text
              className="atlas-map-count atlas-map-lane-name"
              x={midX}
              y={midY + 18}
              textAnchor="middle"
            >
              {node.entity.name}
            </text>
          </g>
        );
      })}

      {graph.planetIds.map((planetId, index) => {
        const node = graph.nodes.get(planetId);
        if (!node) {
          return null;
        }
        const orbitRadius = FIRST_ORBIT + index * ORBIT_GAP;
        const angle = bodyAngle(index, orbitRadius);
        const x = SUN_X + orbitRadius * Math.cos(angle);
        const y = SUN_Y + orbitRadius * Math.sin(angle);
        const radius = PROMINENCE_RADIUS[node.entity.prominence];
        const isHome = planetId === graph.homeId;
        const orbitChildren = node.children.orbit
          .map((id) => graph.nodes.get(id))
          .filter((child): child is NonNullable<typeof child> => Boolean(child));
        const moons = orbitChildren.filter((child) => child.entity.subkind === 'celestial_body');
        const hasRing = orbitChildren.length > moons.length;
        const charted = descendantCount(graph, planetId);
        return (
          <g key={planetId}>
            <g
              className={`atlas-map-body${isHome ? ' atlas-map-home' : ''}`}
              tabIndex={0}
              role="link"
              aria-label={node.entity.name}
              onClick={activate(node.entity.slug)}
              onKeyDown={keyActivate(node.entity.slug)}
            >
              <title>
                {`${node.entity.name}${charted > 0 ? ` — ${charted} charted ${charted === 1 ? 'place' : 'places'}` : ''}`}
              </title>
              {hasRing ? (
                <ellipse
                  className="atlas-map-ring"
                  cx={x}
                  cy={y}
                  rx={radius + 12}
                  ry={(radius + 12) * 0.32}
                  transform={`rotate(-24 ${x} ${y})`}
                />
              ) : null}
              <circle className="atlas-map-planet" cx={x} cy={y} r={radius} />
              {isHome ? (
                <circle className="atlas-map-home-halo" cx={x} cy={y} r={radius + 22} />
              ) : null}
              <text className="atlas-map-name" x={x} y={y + radius + 26} textAnchor="middle">
                {node.entity.name}
              </text>
              {charted > 0 ? (
                <text className="atlas-map-count" x={x} y={y + radius + 44} textAnchor="middle">
                  {charted} charted
                </text>
              ) : null}
            </g>
            {moons.slice(0, 3).map((moon, moonIndex) => {
              const moonAngle = -0.9 - moonIndex * 0.8;
              const moonDistance = radius + 18 + moonIndex * 12;
              const mx = x + moonDistance * Math.cos(moonAngle);
              const my = y + moonDistance * Math.sin(moonAngle);
              return (
                <g
                  key={moon.entity.id}
                  className="atlas-map-body atlas-map-moon"
                  tabIndex={0}
                  role="link"
                  aria-label={moon.entity.name}
                  onClick={activate(moon.entity.slug)}
                  onKeyDown={keyActivate(moon.entity.slug)}
                >
                  <title>{moon.entity.name}</title>
                  <circle className="atlas-map-moon-dot" cx={mx} cy={my} r={3.5} />
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
