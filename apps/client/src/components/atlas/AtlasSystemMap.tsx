import type { HardStateProminence } from '@glass-frontier/dto';
import React from 'react';

import type { AtlasGraph } from './atlasGraph';
import { descendantCount, planetAncestorId, routeIds, terminusPartnerIds } from './atlasGraph';

/**
 * The orbital chart on the atlas index: the sun at the left edge, one arc per
 * body orbiting it (ordered inner → outer by canon's `inner_of` edges), moons
 * and rings drawn against their planet. Purely derived from the graph — no
 * coordinates exist in canon, so spacing is presentational.
 */

type AtlasSystemMapProps = {
  graph: AtlasGraph;
  onSelect: (slug: string) => void;
};

const VIEW_WIDTH = 1200;
const VIEW_HEIGHT = 360;
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

export function AtlasSystemMap({ graph, onSelect }: AtlasSystemMapProps): React.JSX.Element {
  const sun = graph.sunId === null ? null : graph.nodes.get(graph.sunId) ?? null;
  const system = graph.systemId === null ? null : graph.nodes.get(graph.systemId) ?? null;

  const activate = (slug: string) => () => onSelect(slug);
  const keyActivate = (slug: string) => (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(slug);
    }
  };

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
        <radialGradient id="atlas-sun-glow" cx="50%" cy="50%" r="50%">
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
        <circle cx={SUN_X} cy={SUN_Y} r={240} fill="url(#atlas-sun-glow)" />
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
            <text className="atlas-map-count atlas-map-lane-name" x={midX} y={midY + 18} textAnchor="middle">
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
