import type { LocationGraphSnapshot, LocationPlace } from '@glass-frontier/dto';
import { DataGrid } from '@mui/x-data-grid';
import type {
  GridColDef,
  GridPaginationModel,
  GridRenderCellParams,
  GridRowSelectionModel,
} from '@mui/x-data-grid';
import React, { useCallback, useMemo, useState } from 'react';

import type { LocationFilters, UpdatePlacePayload } from '../../../stores/locationMaintenanceStore';
import {
  ROOT_FILTER_VALUE,
  decodeTags,
  matchFilters,
  toTagString,
} from './locationUtils';

export type LocationGridRow = {
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

export const LocationGridPanel = ({
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
    pageSize: 20,
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
      const first = Array.from(model.ids.values())[0];
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
