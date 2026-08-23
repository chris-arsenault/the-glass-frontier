import type { HardState } from '@glass-frontier/dto';
import React, { useMemo, useState } from 'react';

import { AtlasBodyMap } from './AtlasBodyMap';
import { AtlasClusterChart } from './AtlasClusterChart';
import type { AtlasGraph } from './atlasGraph';
import { breadcrumbIds, childIds, descendantCount } from './atlasGraph';
import { AtlasSystemMap } from './AtlasSystemMap';
import './WorldAtlasPage.css';

/**
 * The one way places are browsed anywhere in the client. The Atlas mounts it
 * with the gazetteer beside the chart to navigate entity pages; the chronicle
 * wizard mounts it in picker mode, where the chart is the whole interface:
 * click a body to descend into its orbit and surface, keep descending through
 * rings, regions, and settlements, and click a highlighted place to choose it
 * as the scene opener. Only childless places outside the curated set are
 * inert in the picker.
 */
type AtlasLocationBrowserProps = {
  graph: AtlasGraph;
  byId: Map<string, HardState>;
  onOpen: (entity: HardState) => void;
  /** 'atlas' navigates on every click; 'picker' selects and drills. */
  mode?: 'atlas' | 'picker';
  /** Highlighted entity, for picker use. */
  selectedId?: string | null;
  /** Picker mode: the only entities a click may choose. */
  selectableIds?: ReadonlySet<string>;
  /** Optional second column beside the gazetteer (atlas mode only). */
  sidePanel?: React.ReactNode;
};

export function AtlasLocationBrowser({
  byId,
  graph,
  mode = 'atlas',
  onOpen,
  selectableIds,
  selectedId = null,
  sidePanel,
}: AtlasLocationBrowserProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [focusId, setFocusId] = useState<string | null>(null);

  const systemName =
    (graph.systemId !== null ? byId.get(graph.systemId)?.name : undefined) ?? 'Charted space';

  const isSelectable = (id: string): boolean =>
    selectableIds === undefined || selectableIds.has(id);

  const hasChildren = (id: string): boolean => {
    const node = graph.nodes.get(id);
    return node !== undefined && childIds(node).length > 0;
  };

  /** Picker routing: choose what may be chosen, descend into what contains more. */
  const handleEntity = (entity: HardState) => {
    if (mode === 'atlas') {
      onOpen(entity);
      return;
    }
    if (isSelectable(entity.id)) {
      onOpen(entity);
    }
    if (hasChildren(entity.id) && graph.nodes.has(entity.id)) {
      setFocusId(entity.id);
    }
    setQuery('');
  };

  const handleSlug = (slug: string) => {
    const id = graph.idBySlug.get(slug);
    const entity = id === undefined ? undefined : byId.get(id);
    if (entity) {
      handleEntity(entity);
    }
  };

  const matches = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (trimmed.length === 0) {
      return null;
    }
    return [...graph.nodes.values()]
      .filter((node) => {
        const { description, name, slug } = node.entity;
        return (
          name.toLowerCase().includes(trimmed) ||
          slug.toLowerCase().includes(trimmed) ||
          (description ?? '').toLowerCase().includes(trimmed)
        );
      })
      .map((node) => node.entity)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [graph, query]);

  const focusNode = focusId === null ? null : graph.nodes.get(focusId) ?? null;
  const selected = selectedId === null ? undefined : byId.get(selectedId);
  // The root crumb already names the system, so drop it from the chain.
  const crumbs =
    mode === 'picker' && focusNode !== null
      ? breadcrumbIds(graph, focusNode.entity.id)
        .filter((id) => id !== graph.systemId)
        .map((id) => byId.get(id))
        .filter((entity): entity is HardState => Boolean(entity))
      : [];

  const chart =
    matches !== null ? (
      <ul className="atlas-gazetteer atlas-browser-results">
        {matches.length === 0 ? (
          <p className="atlas-empty-copy">Nothing charted matches “{query.trim()}”.</p>
        ) : (
          matches.map((entity) => (
            <li key={entity.id}>
              <GazetteerRow
                entity={entity}
                depth={0}
                charted={descendantCount(graph, entity.id)}
                isSelectable={
                  mode !== 'picker' || isSelectable(entity.id) || hasChildren(entity.id)
                }
                isSelected={entity.id === selectedId}
                onOpen={handleEntity}
              />
            </li>
          ))
        )}
      </ul>
    ) : mode === 'picker' && focusNode !== null ? (
      focusNode.children.orbit.length > 0 || focusNode.children.surface.length > 0 ? (
        <AtlasBodyMap
          graph={graph}
          body={focusNode}
          resolve={(id) => byId.get(id)}
          onOpen={handleSlug}
        />
      ) : (
        <AtlasClusterChart
          graph={graph}
          node={focusNode}
          onSelect={handleSlug}
          selectableIds={selectableIds}
        />
      )
    ) : (
      <AtlasSystemMap graph={graph} onSelect={handleSlug} />
    );

  const mapPanel = (
    <section className="atlas-map-panel" aria-label={systemName}>
      <div className="atlas-panel-title-row">
        {mode === 'picker' ? (
          <div className="atlas-browser-crumbs">
            <button
              type="button"
              className="atlas-browser-crumb"
              onClick={() => setFocusId(null)}
              aria-current={focusNode === null ? 'true' : undefined}
            >
              {systemName}
            </button>
            {crumbs.map((crumb) => (
              <React.Fragment key={crumb.id}>
                <span className="atlas-breadcrumb-sep" aria-hidden="true">
                  /
                </span>
                <button
                  type="button"
                  className="atlas-browser-crumb"
                  onClick={() => setFocusId(crumb.id)}
                  aria-current={focusNode?.entity.id === crumb.id ? 'true' : undefined}
                >
                  {crumb.name}
                </button>
              </React.Fragment>
            ))}
          </div>
        ) : (
          <h2>{systemName}</h2>
        )}
        <div className="atlas-browser-tools">
          {mode === 'picker' ? (
            <p className="atlas-panel-note atlas-browser-selection">
              {selected ? (
                <>
                  scene opens at <strong>{selected.name}</strong>
                </>
              ) : (
                'pick a highlighted place'
              )}
            </p>
          ) : graph.sunId !== null ? (
            <p className="atlas-panel-note">
              {graph.planetIds.length} bodies · click a body to open it
            </p>
          ) : null}
          <input
            type="search"
            className="atlas-browser-search"
            placeholder="Search by name, description, or slug"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>
      {chart}
    </section>
  );

  if (mode === 'picker') {
    return <div className="atlas-browser">{mapPanel}</div>;
  }

  return (
    <div className="atlas-browser">
      {mapPanel}
      <div className="atlas-index-columns">
        <section className="atlas-panel" aria-label="Charted places">
          <h2 className="atlas-panel-heading">Gazetteer</h2>
          {matches !== null ? null : (
            <GazetteerTree
              graph={graph}
              byId={byId}
              onOpen={handleEntity}
              isSelectable={isSelectable}
              selectedId={selectedId}
            />
          )}
        </section>
        {sidePanel}
      </div>
    </div>
  );
}

type GazetteerTreeProps = {
  graph: AtlasGraph;
  byId: Map<string, HardState>;
  onOpen: (entity: HardState) => void;
  isSelectable: (id: string) => boolean;
  selectedId: string | null;
};

function GazetteerTree({
  byId,
  graph,
  isSelectable,
  onOpen,
  selectedId,
}: GazetteerTreeProps): React.JSX.Element {
  const topIds = graph.sunId === null ? graph.rootIds : [...graph.planetIds, ...graph.rootIds];

  const renderNode = (id: string, depth: number): React.JSX.Element | null => {
    const node = graph.nodes.get(id);
    const entity = byId.get(id) ?? node?.entity;
    if (!node || !entity) {
      return null;
    }
    const children = [...node.children.orbit, ...node.children.surface, ...node.children.within];
    return (
      <li key={id}>
        <GazetteerRow
          entity={entity}
          depth={depth}
          charted={children.length > 0 ? descendantCount(graph, id) : 0}
          isSelectable={isSelectable(id)}
          isSelected={id === selectedId}
          onOpen={onOpen}
        />
        {children.length > 0 ? <ul>{children.map((child) => renderNode(child, depth + 1))}</ul> : null}
      </li>
    );
  };

  if (topIds.length === 0) {
    return <p className="atlas-empty-copy">No charted places yet.</p>;
  }
  return <ul className="atlas-gazetteer">{topIds.map((id) => renderNode(id, 0))}</ul>;
}

type GazetteerRowProps = {
  entity: HardState;
  depth: number;
  charted: number;
  isSelectable: boolean;
  isSelected: boolean;
  onOpen: (entity: HardState) => void;
};

function GazetteerRow({
  charted,
  depth,
  entity,
  isSelectable,
  isSelected,
  onOpen,
}: GazetteerRowProps): React.JSX.Element {
  return (
    <button
      type="button"
      className={`atlas-gazetteer-row${isSelected ? ' atlas-gazetteer-row-selected' : ''}${
        isSelectable ? '' : ' atlas-gazetteer-row-context'
      }`}
      style={{ paddingLeft: `${depth * 1.1 + 0.5}rem` }}
      aria-current={isSelected ? 'true' : undefined}
      aria-disabled={isSelectable ? undefined : 'true'}
      onClick={() => onOpen(entity)}
    >
      <span className="atlas-row-name">{entity.name}</span>
      {entity.subkind ? (
        <span className="atlas-row-sub">{entity.subkind.replace(/_/g, ' ')}</span>
      ) : null}
      {charted > 0 ? <span className="atlas-row-count">{charted}</span> : null}
    </button>
  );
}
