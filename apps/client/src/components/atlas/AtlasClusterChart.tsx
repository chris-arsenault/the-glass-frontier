import React from 'react';

import type { AtlasGraph, AtlasNode } from './atlasGraph';
import { childIds, descendantCount } from './atlasGraph';

/**
 * The drill-down view for places without charted geometry. By the time the
 * picker reaches this chart the children are contained places (districts,
 * sites, holds) — never orbiters — so the focused place renders as a stretch
 * of terrain with its sites scattered inside it, not as a planet with moons.
 */
type AtlasClusterChartProps = {
  graph: AtlasGraph;
  node: AtlasNode;
  onSelect: (slug: string) => void;
  /** Picker mode: ids that can be chosen; others render as context. */
  selectableIds?: ReadonlySet<string>;
  /** Entity to render with the chosen-location ring (picker mode). */
  selectedId?: string | null;
};

const VIEW_WIDTH = 1200;
const VIEW_HEIGHT = 440;
const CX = VIEW_WIDTH / 2;
const CY = VIEW_HEIGHT / 2;
const FLATTEN = 0.52;

/** Deterministic [0, 1) from a string, for stable per-entity jitter. */
const hash01 = (text: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
};

/** An irregular closed outline around the center: terrain, not an orbit. */
const terrainPath = (seedText: string, baseRadius: number): string => {
  const phaseA = hash01(seedText) * Math.PI * 2;
  const phaseB = hash01(`${seedText}:b`) * Math.PI * 2;
  const points = Array.from({ length: 48 }, (_, step) => {
    const angle = (step / 48) * Math.PI * 2;
    const wobble =
      1 +
      0.09 * Math.sin(3 * angle + phaseA) +
      0.06 * Math.sin(5 * angle + phaseB) +
      0.035 * Math.sin(8 * angle + phaseA + phaseB);
    const radius = baseRadius * wobble;
    const x = CX + Math.cos(angle) * radius;
    const y = CY - Math.sin(angle) * radius * FLATTEN;
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  return `M ${points.join(' L ')} Z`;
};

export function AtlasClusterChart({
  graph,
  node,
  onSelect,
  selectableIds,
  selectedId = null,
}: AtlasClusterChartProps): React.JSX.Element {
  const children = childIds(node)
    .map((id) => graph.nodes.get(id))
    .filter((child): child is AtlasNode => Boolean(child))
    .sort((a, b) => a.entity.name.localeCompare(b.entity.name));

  const regionRadius = Math.min(430, 300 + children.length * 8);
  const siteRadius = regionRadius * 0.62;

  const isSelectable = (id: string): boolean =>
    selectableIds === undefined || selectableIds.has(id);

  return (
    <svg
      className="atlas-map atlas-cluster"
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      role="img"
      aria-label={`Places within ${node.entity.name}`}
    >
      <path
        className="atlas-terrain-region"
        d={terrainPath(node.entity.slug, regionRadius)}
      />
      <path
        className="atlas-terrain-contour"
        d={terrainPath(`${node.entity.slug}:inner`, regionRadius * 0.8)}
      />
      <text className="atlas-terrain-title" x={CX} y={CY - regionRadius * FLATTEN + 44} textAnchor="middle">
        {node.entity.name}
      </text>

      {children.map((child, index) => {
        // A loose scatter inside the region: even bearings with per-place
        // jitter, so the layout stays stable but never reads as an orbit.
        const jitter = hash01(child.entity.slug);
        const angle = -90 + (index * 360) / children.length + (jitter - 0.5) * 24;
        const radians = (angle * Math.PI) / 180;
        const reach = siteRadius * (0.55 + jitter * 0.45);
        const x = CX + Math.cos(radians) * reach;
        const y = CY - Math.sin(radians) * reach * FLATTEN;
        const charted = descendantCount(graph, child.entity.id);
        const selectable = isSelectable(child.entity.id);
        const explorable = charted > 0;
        const inert = !selectable && !explorable && selectableIds !== undefined;
        return (
          <g
            key={child.entity.id}
            className={`atlas-map-body${inert ? ' atlas-cluster-inert' : ''}${
              selectable && selectableIds !== undefined ? ' atlas-cluster-selectable' : ''
            }${child.entity.id === selectedId ? ' atlas-map-current' : ''}`}
            tabIndex={inert ? undefined : 0}
            role={inert ? undefined : 'link'}
            aria-label={child.entity.name}
            onClick={inert ? undefined : () => onSelect(child.entity.slug)}
            onKeyDown={
              inert
                ? undefined
                : (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(child.entity.slug);
                  }
                }
            }
          >
            <title>
              {`${child.entity.name}${charted > 0 ? ` — ${charted} charted` : ''}`}
            </title>
            <rect
              className="atlas-cluster-dot atlas-terrain-site"
              x={x - (charted > 0 ? 5 : 3.5)}
              y={y - (charted > 0 ? 5 : 3.5)}
              width={charted > 0 ? 10 : 7}
              height={charted > 0 ? 10 : 7}
              transform={`rotate(45 ${x} ${y})`}
            />
            <text
              className="atlas-map-name atlas-cluster-name"
              x={x}
              y={y > CY ? y + 24 : y - 14}
              textAnchor="middle"
            >
              {child.entity.name}
              {charted > 0 ? (
                <tspan className="atlas-bodymap-ring-count"> · {charted}</tspan>
              ) : null}
            </text>
          </g>
        );
      })}
      {children.length === 0 ? (
        <text className="atlas-map-empty" x={CX} y={CY} textAnchor="middle">
          Nothing charted inside {node.entity.name} yet.
        </text>
      ) : null}
    </svg>
  );
}
