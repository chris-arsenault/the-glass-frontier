import type { HardState } from '@glass-frontier/dto';
import React from 'react';

import type { AtlasGraph, AtlasNode } from './atlasGraph';
import { descendantCount, isTetheredEndpoint, terminusPartnerIds } from './atlasGraph';

/**
 * The close-orbit chart for a heavily settled body: the planet's limb rises on
 * the left with its surface regions pinned to it, and everything in orbit is
 * arranged to the right by what it actually is — ring regions as arcs with
 * their habs strung along them, trade lanes as spans with their mid-route
 * hubs, span-linked stations tethered back to the surface, and free stations
 * on the low-orbit track. Only drawn for bodies that have both a surface and
 * an orbital layer; lesser bodies stay with plain tiles.
 */
type AtlasBodyMapProps = {
  graph: AtlasGraph;
  body: AtlasNode;
  resolve: (id: string) => HardState | undefined;
  onOpen: (slug: string) => void;
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

  const activate = (slug: string) => () => onOpen(slug);
  const keyActivate = (slug: string) => (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen(slug);
    }
  };

  const clickable = (node: AtlasNode) => ({
    'aria-label': node.entity.name,
    className: 'atlas-map-body',
    onClick: activate(node.entity.slug),
    onKeyDown: keyActivate(node.entity.slug),
    role: 'link',
    tabIndex: 0,
  });

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
