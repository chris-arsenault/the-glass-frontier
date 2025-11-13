import type {
  LocationBreadcrumbEntry,
  LocationEdgeKind as LocationEdgeKindType,
  LocationGraphSnapshot,
  LocationPlace,
} from '@glass-frontier/dto';
import { LocationEdgeKind as LocationEdgeKindEnum } from '@glass-frontier/dto';
import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';

import { useCanModerate } from '../../../hooks/useUserRole';
import {
  useLocationMaintenanceStore,
  type LocationFilters,
} from '../../../stores/locationMaintenanceStore';
import './LocationMaintenancePage.css';

const ROOT_FILTER_VALUE = '__root__';
const EDGE_KIND_OPTIONS = LocationEdgeKindEnum.options as readonly LocationEdgeKindType[];

type LocationTreeNode = {
  children: LocationTreeNode[];
  place: LocationPlace;
};

const formatTimestamp = (value?: number): string => {
  if (!value) {
    return 'Unknown';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }
  return date.toLocaleString();
};

const toTagString = (tags: string[]): string => tags.join(', ');

const decodeTags = (value: string): string[] =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const buildPlaceMap = (graph: LocationGraphSnapshot | null): Map<string, LocationPlace> => {
  if (!graph) {
    return new Map();
  }
  return new Map(graph.places.map((place) => [place.id, place] as const));
};

const buildTree = (graph: LocationGraphSnapshot | null): LocationTreeNode[] => {
  if (!graph) {
    return [];
  }
  const placeMap = buildPlaceMap(graph);
  const children = new Map<string, LocationPlace[]>();
  for (const edge of graph.edges) {
    if (edge.kind !== 'CONTAINS') {
      continue;
    }
    const src = placeMap.get(edge.src);
    const dst = placeMap.get(edge.dst);
    if (!src || !dst) {
      continue;
    }
    const next = children.get(src.id) ?? [];
    next.push(dst);
    children.set(src.id, next);
  }

  const buildNode = (place: LocationPlace): LocationTreeNode => ({
    children: (children.get(place.id) ?? [])
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((child) => buildNode(child)),
    place,
  });

  const roots = graph.places.filter((place) => !place.canonicalParentId);
  return roots.sort((a, b) => a.name.localeCompare(b.name)).map((root) => buildNode(root));
};

const matchFilters = (
  place: LocationPlace,
  filters: LocationFilters,
  placeMap: Map<string, LocationPlace>
): boolean => {
  const search = filters.search.trim().toLowerCase();
  if (search && !place.name.toLowerCase().includes(search)) {
    return false;
  }
  if (filters.kind && place.kind !== filters.kind) {
    return false;
  }
  if (filters.parentId === ROOT_FILTER_VALUE) {
    return !place.canonicalParentId;
  }
  if (filters.parentId && place.canonicalParentId !== filters.parentId) {
    return false;
  }
  if (filters.parentId && filters.parentId === place.id) {
    return false;
  }
  if (filters.parentId && !placeMap.has(filters.parentId)) {
    return false;
  }
  return true;
};

type ListViewProps = {
  filters: LocationFilters;
  graph: LocationGraphSnapshot | null;
  isLoadingRoots: boolean;
  onSelectPlace: (placeId: string) => void;
  onSelectRoot: (rootId: string) => void;
  onUpdateFilters: (updates: Partial<LocationFilters>) => void;
  roots: LocationPlace[];
  selectedPlaceId: string | null;
  selectedRootId: string | null;
};

const LocationListPanel = ({
  filters,
  graph,
  isLoadingRoots,
  onSelectPlace,
  onSelectRoot,
  onUpdateFilters,
  roots,
  selectedPlaceId,
  selectedRootId,
}: ListViewProps) => {
  const [viewMode, setViewMode] = useState<'list' | 'tree'>('list');
  const placeMap = useMemo(() => buildPlaceMap(graph), [graph]);
  const kindOptions = useMemo(() => {
    const kinds = new Set<string>();
    for (const place of placeMap.values()) {
      kinds.add(place.kind);
    }
    return Array.from(kinds).sort();
  }, [placeMap]);
  const filtered = useMemo(() => {
    if (!graph) {
      return [];
    }
    return graph.places
      .filter((place) => matchFilters(place, filters, placeMap))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filters, graph, placeMap]);

  const tree = useMemo(() => buildTree(graph), [graph]);

  return (
    <section className="lm-panel">
      <header className="lm-panel-header">
        <div>
          <p className="lm-panel-label">Location Roots</p>
          {isLoadingRoots ? <span className="lm-pending">Loading…</span> : null}
        </div>
        <div className="lm-pill-switch">
          <button
            type="button"
            className={viewMode === 'list' ? 'active' : ''}
            onClick={() => setViewMode('list')}
          >
            List
          </button>
          <button
            type="button"
            className={viewMode === 'tree' ? 'active' : ''}
            onClick={() => setViewMode('tree')}
          >
            Tree
          </button>
        </div>
      </header>
      <div className="lm-root-list">
        {roots.map((root) => (
          <button
            key={root.id}
            type="button"
            className={`lm-root-item${root.id === selectedRootId ? ' active' : ''}`}
            onClick={() => onSelectRoot(root.id)}
          >
            <span>{root.name}</span>
            <small>{root.kind}</small>
          </button>
        ))}
      </div>
      <div className="lm-filter-grid">
        <label>
          Search
          <input
            type="search"
            value={filters.search}
            onChange={(event) => onUpdateFilters({ search: event.target.value })}
            placeholder="Name contains…"
          />
        </label>
        <label>
          Type
          <select
            value={filters.kind ?? ''}
            onChange={(event) =>
              onUpdateFilters({ kind: event.target.value === '' ? null : event.target.value })
            }
          >
            <option value="">All types</option>
            {kindOptions.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </label>
        <label>
          Parent
          <select
            value={filters.parentId ?? ''}
            onChange={(event) =>
              onUpdateFilters({
                parentId:
                  event.target.value === ''
                    ? null
                    : event.target.value === ROOT_FILTER_VALUE
                      ? ROOT_FILTER_VALUE
                      : event.target.value,
              })
            }
          >
            <option value="">Any parent</option>
            <option value={ROOT_FILTER_VALUE}>Root level</option>
            {Array.from(placeMap.values())
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((place) => (
                <option key={place.id} value={place.id}>
                  {place.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      {viewMode === 'list' ? (
        <ul className="lm-location-list">
          {filtered.map((place) => (
            <li key={place.id}>
              <button
                type="button"
                className={selectedPlaceId === place.id ? 'active' : ''}
                onClick={() => onSelectPlace(place.id)}
              >
                <span>{place.name}</span>
                <small>{place.kind}</small>
              </button>
            </li>
          ))}
          {filtered.length === 0 ? (
            <li className="lm-empty">No locations match the current filters.</li>
          ) : null}
        </ul>
      ) : (
        <div className="lm-tree-view">
          {tree.length === 0 ? (
            <p className="lm-empty">No locations available.</p>
          ) : (
            <ul>
              {tree.map((node) => (
                <TreeNodeView
                  key={node.place.id}
                  node={node}
                  depth={0}
                  selectedId={selectedPlaceId}
                  onSelect={onSelectPlace}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
};

type TreeNodeProps = {
  depth: number;
  node: LocationTreeNode;
  onSelect: (placeId: string) => void;
  selectedId: string | null;
};

const TreeNodeView = ({ depth, node, onSelect, selectedId }: TreeNodeProps) => {
  return (
    <li>
      <button
        type="button"
        className={`lm-tree-node${selectedId === node.place.id ? ' active' : ''}`}
        style={{ marginLeft: `${depth * 0.75}rem` }}
        onClick={() => onSelect(node.place.id)}
      >
        <span>{node.place.name}</span>
        <small>{node.place.kind}</small>
      </button>
      {node.children.length ? (
        <ul>
          {node.children.map((child) => (
            <TreeNodeView
              key={child.place.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
};

type EditorProps = {
  detail: { breadcrumb: LocationBreadcrumbEntry[]; place: LocationPlace } | null;
  isCreatingChild: boolean;
  isSaving: boolean;
  onCreateChild: (payload: { description?: string; kind: string; name: string; tags: string[] }) => void;
  onRefresh: () => void;
  onSave: (payload: {
    description?: string;
    kind?: string;
    name?: string;
    parentId?: string | null;
    tags?: string[];
  }) => void;
  placeOptions: LocationPlace[];
};

const LocationEditor = ({
  detail,
  isCreatingChild,
  isSaving,
  onCreateChild,
  onRefresh,
  onSave,
  placeOptions,
}: EditorProps) => {
  const [draft, setDraft] = useState(() => ({
    description: detail?.place.description ?? '',
    kind: detail?.place.kind ?? '',
    name: detail?.place.name ?? '',
    parentId: detail?.place.canonicalParentId ?? '',
    tags: detail ? toTagString(detail.place.tags) : '',
  }));
  const [childName, setChildName] = useState('');
  const [childKind, setChildKind] = useState('locale');
  const [childDescription, setChildDescription] = useState('');
  const [childTags, setChildTags] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!detail) {
      return;
    }
    onSave({
      description: draft.description,
      kind: draft.kind,
      name: draft.name,
      parentId: draft.parentId === '' ? null : draft.parentId,
      tags: decodeTags(draft.tags),
    });
  };

  const handleCreateChild = (event: FormEvent) => {
    event.preventDefault();
    if (!detail || !childName.trim()) {
      return;
    }
    onCreateChild({
      description: childDescription.trim() || undefined,
      kind: childKind.trim() || 'locale',
      name: childName.trim(),
      tags: decodeTags(childTags),
    });
    setChildName('');
    setChildDescription('');
    setChildTags('');
  };

  return (
    <section className="lm-panel">
      <header className="lm-panel-header">
        <div>
          <h2>Location Editor</h2>
          {detail ? (
            <p className="lm-panel-subtitle">{detail.breadcrumb.map((entry) => entry.name).join(' · ')}</p>
          ) : (
            <p className="lm-panel-subtitle">Select a location to inspect details.</p>) }
        </div>
        <div className="lm-panel-actions">
          <button type="button" onClick={onRefresh} disabled={!detail || isSaving}>
            Refresh
          </button>
        </div>
      </header>
      {detail ? (
        <form className="lm-editor-form" onSubmit={handleSubmit}>
          <div className="lm-field-grid">
            <label>
              Name
              <input
                value={draft.name}
                onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
              />
            </label>
            <label>
              Type
              <input
                value={draft.kind}
                onChange={(event) => setDraft((prev) => ({ ...prev, kind: event.target.value }))}
              />
            </label>
            <label>
              Parent
              <select
                value={draft.parentId}
                onChange={(event) => setDraft((prev) => ({ ...prev, parentId: event.target.value }))}
              >
                <option value="">No parent</option>
                {placeOptions
                  .filter((place) => place.id !== detail.place.id)
                  .map((place) => (
                    <option key={place.id} value={place.id}>
                      {place.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Last Updated
              <input value={formatTimestamp(detail.place.updatedAt)} disabled readOnly />
            </label>
          </div>
          <label>
            Description
            <textarea
              rows={4}
              value={draft.description}
              onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
            />
          </label>
          <label>
            Tags
            <input
              value={draft.tags}
              onChange={(event) => setDraft((prev) => ({ ...prev, tags: event.target.value }))}
              placeholder="comma,separated,tags"
            />
          </label>
          <div className="lm-form-actions">
            <button type="button" className="ghost" onClick={onRefresh} disabled={isSaving}>
              Reset
            </button>
            <button type="submit" className="primary" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      ) : (
        <p className="lm-empty">Choose a location from the list to edit.</p>
      )}
      {detail ? (
        <form className="lm-child-form" onSubmit={handleCreateChild}>
          <h3>Create sub-location</h3>
          <div className="lm-field-grid">
            <label>
              Name
              <input value={childName} onChange={(event) => setChildName(event.target.value)} />
            </label>
            <label>
              Type
              <input value={childKind} onChange={(event) => setChildKind(event.target.value)} />
            </label>
          </div>
          <label>
            Description
            <textarea
              rows={3}
              value={childDescription}
              onChange={(event) => setChildDescription(event.target.value)}
            />
          </label>
          <label>
            Tags
            <input value={childTags} onChange={(event) => setChildTags(event.target.value)} />
          </label>
          <div className="lm-form-actions">
            <button type="submit" disabled={isCreatingChild || !childName.trim()}>
              {isCreatingChild ? 'Creating…' : 'Add sub-location'}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
};

type RelationshipPanelProps = {
  graph: LocationGraphSnapshot | null;
  isMutating: boolean;
  onAdd: (input: { kind: LocationEdgeKindType; targetId: string }) => void;
  onRemove: (input: { kind: LocationEdgeKindType; targetId: string }) => void;
  onSelect: (placeId: string) => void;
  placeMap: Map<string, LocationPlace>;
  selectedPlaceId: string | null;
};

const RelationshipPanel = ({
  graph,
  isMutating,
  onAdd,
  onRemove,
  onSelect,
  placeMap,
  selectedPlaceId,
}: RelationshipPanelProps) => {
  const [targetId, setTargetId] = useState('');
  const [kind, setKind] = useState<LocationEdgeKindType>('CONNECTED_TO');

  const outgoing = useMemo(() => {
    if (!graph || !selectedPlaceId) {
      return [];
    }
    return graph.edges.filter((edge) => edge.src === selectedPlaceId);
  }, [graph, selectedPlaceId]);

  const incoming = useMemo(() => {
    if (!graph || !selectedPlaceId) {
      return [];
    }
    return graph.edges.filter((edge) => edge.dst === selectedPlaceId);
  }, [graph, selectedPlaceId]);

  const handleAdd = (event: FormEvent) => {
    event.preventDefault();
    if (!targetId || !selectedPlaceId) {
      return;
    }
    onAdd({ kind, targetId });
    setTargetId('');
  };

  return (
    <section className="lm-panel">
      <header className="lm-panel-header">
        <h2>Relationships</h2>
      </header>
      {selectedPlaceId ? (
        <div className="lm-relationship-grid">
          <div>
            <h3>Outgoing</h3>
            {outgoing.length === 0 ? (
              <p className="lm-empty">No outgoing edges.</p>
            ) : (
              <ul className="lm-edge-list">
                {outgoing.map((edge) => (
                  <li key={`${edge.src}-${edge.kind}-${edge.dst}`}>
                    <button type="button" onClick={() => onSelect(edge.dst)}>
                      {placeMap.get(edge.dst)?.name ?? edge.dst}
                    </button>
                    <span className="lm-chip">{edge.kind}</span>
                    <button
                      type="button"
                      className="lm-remove"
                      onClick={() => onRemove({ kind: edge.kind, targetId: edge.dst })}
                      disabled={isMutating}
                      title="Remove relationship"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3>Incoming</h3>
            {incoming.length === 0 ? (
              <p className="lm-empty">No incoming edges.</p>
            ) : (
              <ul className="lm-edge-list">
                {incoming.map((edge) => (
                  <li key={`${edge.src}-${edge.kind}-${edge.dst}`}>
                    <button type="button" onClick={() => onSelect(edge.src)}>
                      {placeMap.get(edge.src)?.name ?? edge.src}
                    </button>
                    <span className="lm-chip">{edge.kind}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <p className="lm-empty">Select a location to manage relationships.</p>
      )}
      <form className="lm-relationship-form" onSubmit={handleAdd}>
        <h3>Add relationship</h3>
        <label>
          Target location
          <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
            <option value="">Select a location</option>
            {Array.from(placeMap.values())
              .filter((place) => place.id !== selectedPlaceId)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((place) => (
                <option key={place.id} value={place.id}>
                  {place.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Relationship type
          <select
            value={kind}
            onChange={(event) =>
              setKind(event.target.value.toUpperCase() as LocationEdgeKindType)
            }
          >
            {EDGE_KIND_OPTIONS.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={!targetId || isMutating}>
          {isMutating ? 'Saving…' : 'Add relationship'}
        </button>
      </form>
    </section>
  );
};

type GraphPanelProps = {
  detail: { breadcrumb: LocationBreadcrumbEntry[]; place: LocationPlace } | null;
  graph: LocationGraphSnapshot | null;
  onSelect: (placeId: string) => void;
  placeMap: Map<string, LocationPlace>;
};

const GraphPanel = ({ detail, graph, onSelect, placeMap }: GraphPanelProps) => {
  const parentId = detail?.place?.canonicalParentId ?? null;
  const parent = parentId ? placeMap.get(parentId) : null;
  const children = useMemo(() => {
    if (!graph || !detail) {
      return [];
    }
    return graph.edges
      .filter((edge) => edge.kind === 'CONTAINS' && edge.src === detail.place.id)
      .map((edge) => placeMap.get(edge.dst))
      .filter((place): place is LocationPlace => Boolean(place));
  }, [graph, detail, placeMap]);

  const lateral = useMemo(() => {
    if (!graph || !detail) {
      return [];
    }
    const results: LocationPlace[] = [];
    for (const edge of graph.edges) {
      if (edge.kind === 'CONTAINS') {
        continue;
      }
      if (edge.src === detail.place.id) {
        const target = placeMap.get(edge.dst);
        if (target) {
          results.push(target);
        }
      } else if (edge.dst === detail.place.id) {
        const source = placeMap.get(edge.src);
        if (source) {
          results.push(source);
        }
      }
    }
    return results;
  }, [graph, detail, placeMap]);

  return (
    <section className="lm-panel">
      <header className="lm-panel-header">
        <h2>Graph Overview</h2>
      </header>
      {detail ? (
        <div className="lm-graph">
          <div className="lm-graph-column">
            <h3>Parent</h3>
            {parent ? (
              <button type="button" onClick={() => onSelect(parent.id)} className="lm-graph-node">
                <span>{parent.name}</span>
                <small>{parent.kind}</small>
              </button>
            ) : (
              <p className="lm-empty">No parent assigned.</p>
            )}
          </div>
          <div className="lm-graph-column focus">
            <h3>Selected</h3>
            <div className="lm-graph-node active">
              <span>{detail.place.name}</span>
              <small>{detail.place.kind}</small>
            </div>
            <p className="lm-graph-meta">
              {detail.place.description || 'No description.'}
            </p>
          </div>
          <div className="lm-graph-column">
            <h3>Children</h3>
            {children.length === 0 ? (
              <p className="lm-empty">No child nodes.</p>
            ) : (
              <ul>
                {children.map((child) => (
                  <li key={child.id}>
                    <button type="button" onClick={() => onSelect(child.id)} className="lm-graph-node">
                      <span>{child.name}</span>
                      <small>{child.kind}</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <p className="lm-empty">Select a location to visualize relationships.</p>
      )}
      {detail ? (
        <div>
          <h3>Lateral connections</h3>
          {lateral.length === 0 ? (
            <p className="lm-empty">No lateral connections.</p>
          ) : (
            <div className="lm-chip-row">
              {lateral.map((place) => (
                <button key={place.id} type="button" onClick={() => onSelect(place.id)}>
                  {place.name}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
};

export function LocationMaintenancePage(): JSX.Element {
  const canModerate = useCanModerate();
  const navigate = useNavigate();
  const {
    addRelationship,
    clearError,
    createChildPlace,
    error,
    filters,
    graph,
    isCreatingChild,
    isLoadingGraph,
    isLoadingRoots,
    isMutatingEdge,
    isSavingPlace,
    loadRoots,
    refreshGraph,
    removeRelationship,
    roots,
    selectedDetail,
    selectedPlaceId,
    selectedRootId,
    selectPlace,
    selectRoot,
    setFilters,
    updatePlace,
  } = useLocationMaintenanceStore(
    useShallow((state) => ({
      addRelationship: state.addRelationship,
      clearError: state.clearError,
      createChildPlace: state.createChildPlace,
      error: state.error,
      filters: state.filters,
      graph: state.graph,
      isCreatingChild: state.isCreatingChild,
      isLoadingGraph: state.isLoadingGraph,
      isLoadingRoots: state.isLoadingRoots,
      isMutatingEdge: state.isMutatingEdge,
      isSavingPlace: state.isSavingPlace,
      loadRoots: state.loadRoots,
      refreshGraph: state.refreshGraph,
      removeRelationship: state.removeRelationship,
      roots: state.roots,
      selectedDetail: state.selectedDetail,
      selectedPlaceId: state.selectedPlaceId,
      selectedRootId: state.selectedRootId,
      selectPlace: state.selectPlace,
      selectRoot: state.selectRoot,
      setFilters: state.setFilters,
      updatePlace: state.updatePlace,
    }))
  );

  useEffect(() => {
    if (canModerate) {
      void loadRoots();
    }
  }, [canModerate, loadRoots]);

  const placeMap = useMemo(() => buildPlaceMap(graph), [graph]);

  if (!canModerate) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="lm-page">
      <header className="lm-page-header">
        <div>
          <h1>Location Maintenance</h1>
          <p>Review, edit, and connect locations across the world graph.</p>
        </div>
        <div className="lm-page-actions">
          <button type="button" onClick={() => navigate('/')}>Back to Chronicle</button>
          <button type="button" onClick={() => void refreshGraph()} disabled={isLoadingGraph}>
            {isLoadingGraph ? 'Refreshing…' : 'Refresh Graph'}
          </button>
        </div>
      </header>
      {error ? (
        <div className="lm-alert" role="alert">
          <p>{error}</p>
          <button type="button" onClick={clearError}>Dismiss</button>
        </div>
      ) : null}
      <div className="lm-layout">
        <LocationListPanel
          filters={filters}
          graph={graph}
          onSelectPlace={(placeId) => void selectPlace(placeId)}
          onUpdateFilters={setFilters}
          selectedPlaceId={selectedPlaceId}
          selectedRootId={selectedRootId}
          onSelectRoot={(rootId) => void selectRoot(rootId)}
          roots={roots}
          isLoadingRoots={isLoadingRoots}
        />
        <LocationEditor
          key={selectedDetail?.place.id ?? 'empty-editor'}
          detail={selectedDetail}
          onSave={(payload) => void updatePlace(payload)}
          onRefresh={() => {
            if (selectedPlaceId) {
              void selectPlace(selectedPlaceId);
            }
          }}
          isSaving={isSavingPlace}
          placeOptions={graph?.places ?? []}
          onCreateChild={(payload) => void createChildPlace(payload)}
          isCreatingChild={isCreatingChild}
        />
        <div className="lm-side-column">
          <GraphPanel
            detail={selectedDetail}
            placeMap={placeMap}
            graph={graph}
            onSelect={(placeId) => void selectPlace(placeId)}
          />
          <RelationshipPanel
            key={selectedPlaceId ?? 'no-selection'}
            graph={graph}
            selectedPlaceId={selectedPlaceId}
            placeMap={placeMap}
            onSelect={(placeId) => void selectPlace(placeId)}
            onAdd={(input) => void addRelationship(input)}
            onRemove={(input) => void removeRelationship(input)}
            isMutating={isMutatingEdge}
          />
        </div>
      </div>
    </div>
  );
}
