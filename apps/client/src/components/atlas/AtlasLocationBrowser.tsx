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
const subkindLabel = (entity: HardState): string =>
  (entity.subkind ?? entity.kind).replace(/_/g, ' ');

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
  const chainTo = (id: string): HardState[] =>
    breadcrumbIds(graph, id)
      .filter((chainId) => chainId !== graph.systemId)
      .map((chainId) => byId.get(chainId))
      .filter((entity): entity is HardState => Boolean(entity));
  const crumbs = mode === 'picker' && focusNode !== null ? chainTo(focusNode.entity.id) : [];
  // Where the up arrow leads: the focused entity's parent, or the system view.
  const upCrumb = crumbs.length > 1 ? crumbs[crumbs.length - 2] : null;
  const selectedChain =
    selected === undefined
      ? []
      : chainTo(selected.id).filter((entity) => entity.id !== selected.id);

  // Only celestial bodies get the orbit/surface chart; settlements and
  // regions with sub-places open as cluster views instead.
  const focusIsBody =
    focusNode !== null &&
    (focusNode.children.orbit.length > 0 ||
      (focusNode.children.surface.length > 0 &&
        focusNode.entity.subkind === 'celestial_body'));

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
    ) : mode === 'picker' && focusNode !== null && focusNode.entity.id !== graph.sunId ? (
      focusIsBody ? (
        <AtlasBodyMap
          graph={graph}
          body={focusNode}
          resolve={(id) => byId.get(id)}
          onOpen={handleSlug}
          selectedId={selectedId}
        />
      ) : (
        <AtlasClusterChart
          graph={graph}
          node={focusNode}
          onSelect={handleSlug}
          selectableIds={selectableIds}
          selectedId={selectedId}
        />
      )
    ) : (
      <AtlasSystemMap graph={graph} onSelect={handleSlug} selectedId={selectedId} />
    );

  const searchInput = (
    <input
      type="search"
      className="atlas-browser-search"
      placeholder="Search by name, description, or slug"
      value={query}
      onChange={(event) => setQuery(event.target.value)}
    />
  );

  if (mode === 'picker') {
    const focusEntity = focusNode?.entity ?? null;
    const focusCharted = focusEntity === null ? 0 : descendantCount(graph, focusEntity.id);
    const focusSelectable = focusEntity !== null && isSelectable(focusEntity.id);
    return (
      <div className="atlas-browser">
        <section className="atlas-map-panel" aria-label={systemName}>
          <div className="atlas-picker-nav">
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
            {focusNode !== null ? (
              <button
                type="button"
                className="atlas-picker-up"
                onClick={() => setFocusId(upCrumb?.id ?? null)}
              >
                ↑ Up to {upCrumb?.name ?? systemName}
              </button>
            ) : null}
            {searchInput}
          </div>
          {focusEntity !== null ? (
            <div className="atlas-picker-context">
              <div className="atlas-picker-context-copy">
                <span className="atlas-picker-context-name">{focusEntity.name}</span>
                <span className="atlas-picker-context-meta">
                  {subkindLabel(focusEntity)}
                  {focusCharted > 0
                    ? ` · ${focusCharted} charted ${focusCharted === 1 ? 'place' : 'places'}`
                    : ''}
                </span>
                {focusEntity.description ? (
                  <span className="atlas-picker-context-desc">{focusEntity.description}</span>
                ) : null}
              </div>
              {focusSelectable ? (
                <button
                  type="button"
                  className="atlas-picker-start"
                  onClick={() => onOpen(focusEntity)}
                  disabled={selectedId === focusEntity.id}
                >
                  {selectedId === focusEntity.id
                    ? 'Chronicle starts here'
                    : `Start at ${focusEntity.name}`}
                </button>
              ) : null}
            </div>
          ) : null}
          {chart}
          <div
            className={`atlas-picker-selection${selected ? '' : ' atlas-picker-selection-empty'}`}
            role="status"
          >
            {selected ? (
              <>
                <span className="atlas-picker-selection-label">Chronicle opens at</span>
                <span className="atlas-picker-selection-name">{selected.name}</span>
                <span className="atlas-picker-selection-meta">
                  {subkindLabel(selected)}
                  {selectedChain.length > 0
                    ? ` — ${selectedChain.map((entity) => entity.name).join(' · ')}`
                    : ''}
                </span>
                {selected.description ? (
                  <span className="atlas-picker-selection-desc">{selected.description}</span>
                ) : null}
              </>
            ) : (
              <span className="atlas-picker-selection-hint">
                No starting location chosen yet — click a glowing place on the chart, or open a
                body and use its “Start at …” button.
              </span>
            )}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="atlas-browser">
      <section className="atlas-map-panel" aria-label={systemName}>
        <div className="atlas-panel-title-row">
          <h2>{systemName}</h2>
          <div className="atlas-browser-tools">
            {graph.sunId !== null ? (
              <p className="atlas-panel-note">
                {graph.planetIds.length} bodies · click a body to open it
              </p>
            ) : null}
            {searchInput}
          </div>
        </div>
        {chart}
      </section>
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
