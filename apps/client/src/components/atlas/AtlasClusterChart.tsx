import React from 'react';

import type { AtlasGraph, AtlasNode } from './atlasGraph';
import { childIds, descendantCount } from './atlasGraph';

/**
 * The drill-down view for places without charted geometry: the focused place
 * at center, everything directly inside it arranged on a ring around it.
 * This is what opens inside ring habitats, regions, and settlements, so the
 * chart can keep descending long after authored coordinates run out.
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
const CY = VIEW_HEIGHT / 2 - 10;
const FLATTEN = 0.55;

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

  const ringRadius = Math.min(420, 220 + children.length * 6);

  const isSelectable = (id: string): boolean =>
    selectableIds === undefined || selectableIds.has(id);

  return (
    <svg
      className="atlas-map atlas-cluster"
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      role="img"
      aria-label={`Places within ${node.entity.name}`}
    >
      <ellipse
        className="atlas-cluster-ring"
        cx={CX}
        cy={CY}
        rx={ringRadius}
        ry={ringRadius * FLATTEN}
      />
      <circle className="atlas-bodymap-planet-dot" cx={CX} cy={CY} r={20} />
      <text className="atlas-map-name" x={CX} y={CY + 40} textAnchor="middle">
        {node.entity.name}
      </text>

      {children.map((child, index) => {
        const angle = -90 + (index * 360) / children.length;
        const radians = (angle * Math.PI) / 180;
        const x = CX + Math.cos(radians) * ringRadius;
        const y = CY - Math.sin(radians) * ringRadius * FLATTEN;
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
            <circle
              className="atlas-cluster-dot"
              cx={x}
              cy={y}
              r={charted > 0 ? 6.5 : 4.5}
            />
            <text
              className="atlas-map-name atlas-cluster-name"
              x={x}
              y={y > CY ? y + 22 : y - 12}
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
        <text className="atlas-map-empty" x={CX} y={CY - 60} textAnchor="middle">
          Nothing charted inside {node.entity.name} yet.
        </text>
      ) : null}
    </svg>
  );
}
