import type { HardState } from '@glass-frontier/dto';
import React, { useMemo, useState } from 'react';

import type { AtlasGraph } from './atlasGraph';
import { descendantCount } from './atlasGraph';
import { AtlasSystemMap } from './AtlasSystemMap';
import './WorldAtlasPage.css';

/**
 * The one way places are browsed anywhere in the client: the system chart on
 * top, the gazetteer tree beneath it, with search cutting across both. The
 * Atlas mounts it to navigate; the chronicle wizard mounts the same component
 * to pick a scene location.
 */
type AtlasLocationBrowserProps = {
  graph: AtlasGraph;
  byId: Map<string, HardState>;
  onOpen: (entity: HardState) => void;
  /** Highlighted entity, for picker use. */
  selectedId?: string | null;
  /**
   * Picker mode: only these entities respond to a click; everything else
   * stays on the chart as context but renders muted. Omit for navigation,
   * where every entity opens.
   */
  selectableIds?: ReadonlySet<string>;
  /** Optional second column beside the gazetteer (registry, detail card…). */
  sidePanel?: React.ReactNode;
};

export function AtlasLocationBrowser({
  byId,
  graph,
  onOpen,
  selectableIds,
  selectedId = null,
  sidePanel,
}: AtlasLocationBrowserProps): React.JSX.Element {
  const [query, setQuery] = useState('');

  const systemName =
    (graph.systemId !== null ? byId.get(graph.systemId)?.name : undefined) ?? 'Charted space';

  const isSelectable = (id: string): boolean =>
    selectableIds === undefined || selectableIds.has(id);

  const open = (entity: HardState) => {
    if (isSelectable(entity.id)) {
      onOpen(entity);
    }
  };

  const openSlug = (slug: string) => {
    const id = graph.idBySlug.get(slug);
    const entity = id === undefined ? undefined : byId.get(id);
    if (entity) {
      open(entity);
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
            <input
              type="search"
              className="atlas-browser-search"
              placeholder="Search by name, description, or slug"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
        <AtlasSystemMap graph={graph} onSelect={openSlug} />
      </section>

      <div className="atlas-index-columns">
        <section className="atlas-panel" aria-label="Charted places">
          <h2 className="atlas-panel-heading">Gazetteer</h2>
          {matches === null ? (
            <GazetteerTree
              graph={graph}
              byId={byId}
              onOpen={open}
              isSelectable={isSelectable}
              selectedId={selectedId}
            />
          ) : matches.length === 0 ? (
            <p className="atlas-empty-copy">Nothing charted matches “{query.trim()}”.</p>
          ) : (
            <ul className="atlas-gazetteer">
              {matches.map((entity) => (
                <li key={entity.id}>
                  <GazetteerRow
                    entity={entity}
                    depth={0}
                    charted={descendantCount(graph, entity.id)}
                    isSelectable={isSelectable(entity.id)}
                    isSelected={entity.id === selectedId}
                    onOpen={open}
                  />
                </li>
              ))}
            </ul>
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
