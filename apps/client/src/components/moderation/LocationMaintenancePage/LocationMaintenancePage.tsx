import type {
  LocationBreadcrumbEntry,
  LocationEdgeKind as LocationEdgeKindType,
  LocationGraphSnapshot,
  LocationPlace,
} from '@glass-frontier/dto';
import { LocationEdgeKind as LocationEdgeKindEnum } from '@glass-frontier/dto';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import type {
  GridColDef,
  GridPaginationModel,
  GridRenderCellParams,
  GridRowSelectionModel,
} from '@mui/x-data-grid';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';

import { useCanModerate } from '../../../hooks/useUserRole';
import {
  useLocationMaintenanceStore,
  type LocationFilters,
  type UpdatePlacePayload,
} from '../../../stores/locationMaintenanceStore';
import './LocationMaintenancePage.css';

const ROOT_FILTER_VALUE = '__root__';
const EDGE_KIND_OPTIONS = LocationEdgeKindEnum.options as readonly LocationEdgeKindType[];

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

type RootSelectorBarProps = {
  isLoading: boolean;
  onSelectRoot: (rootId: string) => void;
  roots: LocationPlace[];
  selectedRootId: string | null;
};

const RootSelectorBar = ({ isLoading, onSelectRoot, roots, selectedRootId }: RootSelectorBarProps) => {
  return (
    <div className="lm-root-bar">
      <div className="lm-root-bar-header">
        <p className="lm-panel-label">Location Roots</p>
        {isLoading ? <span className="lm-pending">Loading…</span> : null}
      </div>
      <div className="lm-root-scroll">
        {roots.length === 0 ? (
          <p className="lm-empty">No roots available.</p>
        ) : (
          roots.map((root) => (
            <button
              key={root.id}
              type="button"
              className={`lm-root-item${root.id === selectedRootId ? ' active' : ''}`}
              onClick={() => onSelectRoot(root.id)}
            >
              <span>{root.name}</span>
              <small>{root.kind}</small>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

type LocationGridRow = {
  description: string;
  id: string;
  kind: string;
  name: string;
  parentId: string;
  relationshipCount: number;
  tagString: string;
  updatedAt: number;
};

type GridPanelProps = {
  filters: LocationFilters;
  graph: LocationGraphSnapshot | null;
  onOpenCreateChild: (row: LocationGridRow) => void;
  onOpenDescription: (row: LocationGridRow) => void;
  onOpenRelationships: (row: LocationGridRow) => void;
  onSelectPlace: (placeId: string) => void;
  onUpdateFilters: (updates: Partial<LocationFilters>) => void;
  placeMap: Map<string, LocationPlace>;
  quickUpdatePlace: (placeId: string, payload: UpdatePlacePayload) => Promise<void>;
  selectedPlaceId: string | null;
};

const LocationGridPanel = ({
  filters,
  graph,
  onOpenCreateChild,
  onOpenDescription,
  onOpenRelationships,
  onSelectPlace,
  onUpdateFilters,
  placeMap,
  quickUpdatePlace,
  selectedPlaceId,
}: GridPanelProps) => {
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 15,
  });

  const handleFilterUpdate = useCallback(
    (updates: Partial<LocationFilters>) => {
      setPaginationModel((prev) => ({ ...prev, page: 0 }));
      onUpdateFilters(updates);
    },
    [onUpdateFilters]
  );

  const relationshipCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!graph) {
      return counts;
    }
    for (const edge of graph.edges) {
      counts.set(edge.src, (counts.get(edge.src) ?? 0) + 1);
      counts.set(edge.dst, (counts.get(edge.dst) ?? 0) + 1);
    }
    return counts;
  }, [graph]);

  const rows = useMemo<LocationGridRow[]>(() => {
    if (!graph) {
      return [];
    }
    return graph.places
      .filter((place) => matchFilters(place, filters, placeMap))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((place) => ({
        description: place.description ?? '',
        id: place.id,
        kind: place.kind,
        name: place.name,
        parentId: place.canonicalParentId ?? '',
        relationshipCount: relationshipCounts.get(place.id) ?? 0,
        tagString: toTagString(place.tags),
        updatedAt: place.updatedAt,
      }));
  }, [filters, graph, placeMap, relationshipCounts]);

  const parentOptions = useMemo(() => {
    if (!graph) {
      return [{ label: 'No parent', value: '' }];
    }
    return [
      { label: 'No parent', value: '' },
      ...graph.places
        .map((place) => ({ label: place.name, value: place.id }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [graph]);

  const kindOptions = useMemo(() => {
    const kinds = new Set<string>();
    for (const place of placeMap.values()) {
      kinds.add(place.kind);
    }
    return Array.from(kinds).sort();
  }, [placeMap]);

  const columns = useMemo<Array<GridColDef<LocationGridRow>>>(
    () => [
      { editable: true, field: 'name', flex: 1.3, headerName: 'Name' },
      { editable: true, field: 'kind', headerName: 'Type', width: 140 },
      {
        editable: true,
        field: 'parentId',
        flex: 1,
        headerName: 'Parent',
        renderCell: (params: GridRenderCellParams<LocationGridRow>) => {
          const parent = placeMap.get(params.row.parentId ?? '');
          return parent ? parent.name : '—';
        },
        type: 'singleSelect',
        valueOptions: parentOptions,
      },
      {
        field: 'description',
        flex: 1.5,
        headerName: 'Description',
        renderCell: (params: GridRenderCellParams<LocationGridRow>) => (
          <div className="lm-description-cell">
            <span className="lm-description-text">
              {params.row.description ? params.row.description : 'No description'}
            </span>
            <button
              type="button"
              className="lm-grid-link"
              onClick={(event) => {
                event.stopPropagation();
                onOpenDescription(params.row);
              }}
            >
              Edit
            </button>
          </div>
        ),
        sortable: false,
      },
      { editable: true, field: 'tagString', flex: 1.1, headerName: 'Tags' },
      {
        field: 'relationships',
        filterable: false,
        headerName: 'Relationships',
        renderCell: (params: GridRenderCellParams<LocationGridRow>) => (
          <button
            type="button"
            className="lm-grid-link"
            onClick={(event) => {
              event.stopPropagation();
              onOpenRelationships(params.row);
            }}
          >
            {params.row.relationshipCount > 0
              ? `${params.row.relationshipCount} linked`
              : 'Manage relationships'}
          </button>
        ),
        sortable: false,
        width: 170,
      },
      {
        field: 'actions',
        filterable: false,
        headerName: 'Actions',
        renderCell: (params: GridRenderCellParams<LocationGridRow>) => (
          <button
            type="button"
            className="lm-grid-link"
            onClick={(event) => {
              event.stopPropagation();
              onOpenCreateChild(params.row);
            }}
          >
            Add child
          </button>
        ),
        sortable: false,
        width: 140,
      },
    ],
    [onOpenCreateChild, onOpenDescription, onOpenRelationships, parentOptions, placeMap]
  );

  const handleRowSelectionModelChange = useCallback(
    (model: GridRowSelectionModel) => {
      const first = model.ids.values().next().value;
      if (typeof first === 'string') {
        onSelectPlace(first);
      }
    },
    [onSelectPlace]
  );

  const handleProcessRowUpdate = useCallback(
    async (newRow: LocationGridRow, oldRow: LocationGridRow) => {
      if (!newRow.id) {
        return oldRow;
      }
      const normalizedTags = decodeTags(newRow.tagString);
      const targetParentId = newRow.parentId === newRow.id ? oldRow.parentId : newRow.parentId;
      await quickUpdatePlace(newRow.id, {
        kind: newRow.kind,
        name: newRow.name,
        parentId: targetParentId === '' ? null : targetParentId,
        tags: normalizedTags,
      });
      return {
        ...newRow,
        parentId: targetParentId,
        tagString: toTagString(normalizedTags),
      };
    },
    [quickUpdatePlace]
  );

  const handleProcessRowUpdateError = useCallback(() => {
    // Errors already surface via the error banner from the store.
  }, []);

  const rowSelectionModel = useMemo<GridRowSelectionModel>(
    () => ({
      ids: selectedPlaceId ? new Set([selectedPlaceId]) : new Set(),
      type: 'include',
    }),
    [selectedPlaceId]
  );

  return (
    <section className="lm-panel lm-grid-panel">
      <div className="lm-filter-grid">
        <label>
          Search
          <input
            type="search"
            value={filters.search}
            onChange={(event) => handleFilterUpdate({ search: event.target.value })}
            placeholder="Name contains…"
          />
        </label>
        <label>
          Type
          <select
            value={filters.kind ?? ''}
            onChange={(event) =>
              handleFilterUpdate({ kind: event.target.value === '' ? null : event.target.value })
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
              handleFilterUpdate({
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
      <div className="lm-grid-wrapper">
        <DataGrid
          autoHeight={false}
          checkboxSelection={false}
          columns={columns}
          disableColumnFilter
          disableColumnMenu
          disableDensitySelector
          hideFooterSelectedRowCount
          localeText={{
            noRowsLabel: graph
              ? 'No locations match the current filters.'
              : 'Select a root to load locations.',
          }}
          loading={!graph}
          onPaginationModelChange={setPaginationModel}
          onProcessRowUpdateError={handleProcessRowUpdateError}
          onRowSelectionModelChange={handleRowSelectionModelChange}
          pageSizeOptions={[10, 20, 50]}
          pagination
          paginationModel={paginationModel}
          processRowUpdate={handleProcessRowUpdate}
          rowSelectionModel={rowSelectionModel}
          rows={rows}
          style={{ minHeight: '30rem' }}
        />
      </div>
    </section>
  );
};

type RelationshipDialogProps = {
  graph: LocationGraphSnapshot | null;
  isMutating: boolean;
  onAdd: (input: { kind: LocationEdgeKindType; targetId: string }) => Promise<void>;
  onClose: () => void;
  onRemove: (input: { kind: LocationEdgeKindType; targetId: string }) => Promise<void>;
  onSelectPlace: (placeId: string) => Promise<void>;
  open: boolean;
  placeId: string | null;
  placeMap: Map<string, LocationPlace>;
  selectedDetail: { breadcrumb: LocationBreadcrumbEntry[]; place: LocationPlace } | null;
};

const RelationshipDialog = ({
  graph,
  isMutating,
  onAdd,
  onClose,
  onRemove,
  onSelectPlace,
  open,
  placeId,
  placeMap,
  selectedDetail,
}: RelationshipDialogProps) => {
  const [targetId, setTargetId] = useState('');
  const [kind, setKind] = useState<LocationEdgeKindType>(EDGE_KIND_OPTIONS[0]);

  const outgoing = useMemo(() => {
    if (!graph || !placeId) {
      return [];
    }
    return graph.edges.filter((edge) => edge.src === placeId);
  }, [graph, placeId]);

  const incoming = useMemo(() => {
    if (!graph || !placeId) {
      return [];
    }
    return graph.edges.filter((edge) => edge.dst === placeId);
  }, [graph, placeId]);

  const availableTargets = useMemo(() => {
    return Array.from(placeMap.values())
      .filter((place) => place.id !== placeId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [placeId, placeMap]);

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    if (!targetId) {
      return;
    }
    await onAdd({ kind, targetId });
    setTargetId('');
  };

  const breadcrumb =
    selectedDetail && placeId && selectedDetail.place.id === placeId
      ? selectedDetail.breadcrumb.map((entry) => entry.name).join(' · ')
      : placeId
        ? placeMap.get(placeId)?.name ?? 'Selected location'
        : null;

  const handleDialogClose = () => {
    setTargetId('');
    setKind(EDGE_KIND_OPTIONS[0]);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleDialogClose} fullWidth maxWidth="md">
      <DialogTitle>Manage relationships</DialogTitle>
      <DialogContent className="lm-dialog-content">
        <p className="lm-dialog-meta">{breadcrumb ?? 'Select a location from the grid.'}</p>
        <div className="lm-relationship-grid">
          <div>
            <h3>Outgoing</h3>
            {outgoing.length === 0 ? (
              <p className="lm-empty">No outgoing edges.</p>
            ) : (
              <ul className="lm-edge-list">
                {outgoing.map((edge) => (
                  <li key={`${edge.src}-${edge.kind}-${edge.dst}`}>
                    <button type="button" onClick={() => onSelectPlace(edge.dst)}>
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
                    <button type="button" onClick={() => onSelectPlace(edge.src)}>
                      {placeMap.get(edge.src)?.name ?? edge.src}
                    </button>
                    <span className="lm-chip">{edge.kind}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <form className="lm-relationship-form" onSubmit={handleAdd}>
          <h3>Add relationship</h3>
          <label>
            Target location
            <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
              <option value="">Select a location</option>
              {availableTargets.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Relationship type
            <select value={kind} onChange={(event) => setKind(event.target.value as LocationEdgeKindType)}>
              {EDGE_KIND_OPTIONS.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={!targetId || isMutating} variant="contained">
            {isMutating ? 'Saving…' : 'Add relationship'}
          </Button>
        </form>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleDialogClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

type DescriptionDialogProps = {
  description: string;
  isSaving: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  open: boolean;
  place: LocationPlace | null;
};

const DescriptionDialog = ({
  description,
  isSaving,
  onChange,
  onClose,
  onSave,
  open,
  place,
}: DescriptionDialogProps) => {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Edit description</DialogTitle>
      <DialogContent className="lm-dialog-content">
        <p className="lm-dialog-meta">
          {place ? `Location: ${place.name}` : 'Select a location from the grid.'}
        </p>
        <textarea
          className="lm-dialog-textarea"
          rows={5}
          value={description}
          onChange={(event) => onChange(event.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onSave} variant="contained" disabled={isSaving || !place}>
          {isSaving ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

type CreateChildDialogProps = {
  isCreating: boolean;
  onClose: () => void;
  onCreate: (input: {
    description?: string;
    kind: string;
    name: string;
    tags: string[];
  }) => Promise<void>;
  open: boolean;
  parent: LocationPlace | null;
};

const CreateChildDialog = ({ isCreating, onClose, onCreate, open, parent }: CreateChildDialogProps) => {
  const [name, setName] = useState('');
  const [kind, setKind] = useState('locale');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');

  const resetForm = () => {
    setName('');
    setKind('locale');
    setDescription('');
    setTags('');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }
    await onCreate({
      description: description.trim() || undefined,
      kind: kind.trim() || 'locale',
      name: name.trim(),
      tags: decodeTags(tags),
    });
    resetForm();
  };

  const handleDialogClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleDialogClose} fullWidth maxWidth="sm">
      <DialogTitle>Add sub-location</DialogTitle>
      <DialogContent>
        <p className="lm-dialog-meta">
          {parent ? `Parent: ${parent.name}` : 'Select a location from the grid to add a child.'}
        </p>
        <form className="lm-child-form" onSubmit={handleSubmit}>
          <div className="lm-field-grid">
            <label>
              Name
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              Type
              <input value={kind} onChange={(event) => setKind(event.target.value)} />
            </label>
          </div>
          <label>
            Description
            <textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <label>
            Tags
            <input value={tags} onChange={(event) => setTags(event.target.value)} />
          </label>
          <div className="lm-form-actions">
            <Button onClick={handleDialogClose} type="button">
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={isCreating || !parent || !name.trim()}>
              {isCreating ? 'Creating…' : 'Add sub-location'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
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
    loadRoots,
    quickUpdatePlace,
    refreshGraph,
    removeRelationship,
    roots,
    selectedDetail,
    selectedPlaceId,
    selectedRootId,
    selectPlace,
    selectRoot,
    setFilters,
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
      loadRoots: state.loadRoots,
      quickUpdatePlace: state.quickUpdatePlace,
      refreshGraph: state.refreshGraph,
      removeRelationship: state.removeRelationship,
      roots: state.roots,
      selectedDetail: state.selectedDetail,
      selectedPlaceId: state.selectedPlaceId,
      selectedRootId: state.selectedRootId,
      selectPlace: state.selectPlace,
      selectRoot: state.selectRoot,
      setFilters: state.setFilters,
    }))
  );
  const placeMap = useMemo(() => buildPlaceMap(graph), [graph]);

  const [relationshipPlaceId, setRelationshipPlaceId] = useState<string | null>(null);
  const [childParentId, setChildParentId] = useState<string | null>(null);
  const [descriptionPlaceId, setDescriptionPlaceId] = useState<string | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [isSavingDescription, setIsSavingDescription] = useState(false);

  useEffect(() => {
    if (canModerate) {
      void loadRoots();
    }
  }, [canModerate, loadRoots]);

  const handleOpenRelationships = useCallback(
    (row: LocationGridRow) => {
      void selectPlace(row.id);
      setRelationshipPlaceId(row.id);
    },
    [selectPlace]
  );

  const handleOpenDescription = useCallback(
    (row: LocationGridRow) => {
      void selectPlace(row.id);
      setDescriptionPlaceId(row.id);
      setDescriptionDraft(row.description ?? '');
    },
    [selectPlace]
  );

  const handleOpenCreateChild = useCallback(
    (row: LocationGridRow) => {
      void selectPlace(row.id);
      setChildParentId(row.id);
    },
    [selectPlace]
  );

  const handleCreateChild = useCallback(
    async (input: { description?: string; kind: string; name: string; tags: string[] }) => {
      await createChildPlace(input);
      setChildParentId(null);
    },
    [createChildPlace]
  );

  const handleAddRelationship = useCallback(
    async (input: { kind: LocationEdgeKindType; targetId: string }) => {
      await addRelationship(input);
    },
    [addRelationship]
  );

  const handleRemoveRelationship = useCallback(
    async (input: { kind: LocationEdgeKindType; targetId: string }) => {
      await removeRelationship(input);
    },
    [removeRelationship]
  );

  useEffect(() => {
    if (!descriptionPlaceId) {
      return;
    }
    const next = placeMap.get(descriptionPlaceId)?.description ?? '';
    setDescriptionDraft((prev) => (prev === next ? prev : next));
  }, [descriptionPlaceId, placeMap]);

  const handleSaveDescription = useCallback(async () => {
    if (!descriptionPlaceId) {
      return;
    }
    setIsSavingDescription(true);
    try {
      await quickUpdatePlace(descriptionPlaceId, {
        description: descriptionDraft,
      });
      setDescriptionPlaceId(null);
      setDescriptionDraft('');
    } finally {
      setIsSavingDescription(false);
    }
  }, [descriptionDraft, descriptionPlaceId, quickUpdatePlace]);

  const handleCloseDescription = useCallback(() => {
    setDescriptionPlaceId(null);
    setDescriptionDraft('');
  }, []);

  if (!canModerate) {
    return <Navigate to="/" replace />;
  }

  const childDialogParent = childParentId ? placeMap.get(childParentId) ?? null : null;

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
          <button type="button" onClick={clearError}>
            Dismiss
          </button>
        </div>
      ) : null}
      <RootSelectorBar
        isLoading={isLoadingRoots}
        onSelectRoot={(rootId) => void selectRoot(rootId)}
        roots={roots}
        selectedRootId={selectedRootId}
      />
      <div className="lm-layout">
        <LocationGridPanel
          filters={filters}
          graph={graph}
          onOpenCreateChild={handleOpenCreateChild}
          onOpenDescription={handleOpenDescription}
          onOpenRelationships={handleOpenRelationships}
          onSelectPlace={(placeId) => void selectPlace(placeId)}
          onUpdateFilters={setFilters}
          placeMap={placeMap}
          quickUpdatePlace={quickUpdatePlace}
          selectedPlaceId={selectedPlaceId}
        />
      </div>
      <RelationshipDialog
        graph={graph}
        isMutating={isMutatingEdge}
        onAdd={handleAddRelationship}
        onClose={() => setRelationshipPlaceId(null)}
        onRemove={handleRemoveRelationship}
        onSelectPlace={(placeId) => selectPlace(placeId)}
        open={Boolean(relationshipPlaceId)}
        placeId={relationshipPlaceId}
        placeMap={placeMap}
        selectedDetail={selectedDetail}
      />
      <DescriptionDialog
        description={descriptionDraft}
        isSaving={isSavingDescription}
        onChange={(value) => setDescriptionDraft(value)}
        onClose={handleCloseDescription}
        onSave={() => void handleSaveDescription()}
        open={Boolean(descriptionPlaceId)}
        place={descriptionPlaceId ? placeMap.get(descriptionPlaceId) ?? null : null}
      />
      <CreateChildDialog
        isCreating={isCreatingChild}
        onClose={() => setChildParentId(null)}
        onCreate={handleCreateChild}
        open={Boolean(childParentId)}
        parent={childDialogParent}
      />
    </div>
  );
}
