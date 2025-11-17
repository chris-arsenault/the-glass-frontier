import type {
  LocationBreadcrumbEntry,
  LocationEdgeKind,
  LocationGraphSnapshot,
  LocationGraphChunk,
  LocationPlace,
} from '@glass-frontier/worldstate/dto';
import { create } from 'zustand';

import { locationClient } from '../lib/locationClient';
import { mergeLocationGraphChunks } from '../utils/locationGraph';
import { resolveLoginIdentity } from '../utils/loginIdentity';

const ROOT_PAGE_LIMIT = 25;
const GRAPH_CHUNK_LIMIT = 25;

export type LocationFilters = {
  kind: string | null;
  parentId: string | null;
  search: string;
};

type PlaceDetail = {
  breadcrumb: LocationBreadcrumbEntry[];
  place: LocationPlace;
};

export type UpdatePlacePayload = {
  description?: string | null;
  kind?: string;
  name?: string;
  parentId?: string | null;
  tags?: string[];
};

type AddRelationshipInput = {
  kind: LocationEdgeKind;
  target: LocationPlace;
};

type RemoveRelationshipInput = {
  kind: LocationEdgeKind;
  targetId: string;
};

type ChildPlaceInput = {
  description?: string;
  kind: string;
  name: string;
  tags: string[];
};

const fetchRootsPage = async (cursor?: string | null) => {
  const { loginId } = resolveLoginIdentity();
  return locationClient.listLocations.query({
    loginId,
    page: {
      cursor: cursor ?? undefined,
      limit: ROOT_PAGE_LIMIT,
    },
  });
};

const fetchGraphPage = async (locationId: string, cursor?: string | null) => {
  return locationClient.listLocationGraph.query({
    locationId,
    chunkSize: GRAPH_CHUNK_LIMIT,
    page: cursor ? { cursor } : undefined,
  });
};

const generatePlaceId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

type LocationMaintenanceStoreState = {
  addRelationship: (input: AddRelationshipInput) => Promise<void>;
  clearError: () => void;
  createChildPlace: (input: ChildPlaceInput) => Promise<void>;
  error: string | null;
  filters: LocationFilters;
  graphCursor: string | null;
  graph: LocationGraphSnapshot | null;
  hasMoreGraphChunks: boolean;
  hasMoreRoots: boolean;
  isCreatingChild: boolean;
  isLoadingGraph: boolean;
  isLoadingRoots: boolean;
  isMutatingEdge: boolean;
  isSavingPlace: boolean;
  loadRoots: () => Promise<void>;
  loadMoreGraphChunks: () => Promise<void>;
  loadMoreRoots: () => Promise<void>;
  refreshGraph: () => Promise<void>;
  removeRelationship: (input: RemoveRelationshipInput) => Promise<void>;
  rootsCursor: string | null;
  roots: LocationPlace[];
  selectPlace: (placeId: string) => Promise<void>;
  selectRoot: (rootId: string) => Promise<void>;
  selectedDetail: PlaceDetail | null;
  selectedPlaceId: string | null;
  selectedRootId: string | null;
  quickUpdatePlace: (placeId: string, payload: UpdatePlacePayload) => Promise<void>;
  setFilters: (updates: Partial<LocationFilters>) => void;
  updatePlace: (payload: UpdatePlacePayload) => Promise<void>;
};

const defaultFilters: LocationFilters = {
  kind: null,
  parentId: null,
  search: '',
};

const normalizeTags = (tags: string[]): string[] => {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    const value = tag.trim().toLowerCase();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    output.push(value);
    if (output.length >= 12) {
      break;
    }
  }
  return output;
};

const normalizeString = (value?: string | null): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const EDGE_KIND_VALUES: readonly LocationEdgeKind[] = [
  'CONTAINS',
  'ADJACENT_TO',
  'DOCKED_TO',
  'LINKS_TO',
];

const normalizeEdgeKind = (value: string): LocationEdgeKind => {
  const candidate = value.toUpperCase() as LocationEdgeKind;
  if ((EDGE_KIND_VALUES as readonly string[]).includes(candidate)) {
    return candidate;
  }
  return EDGE_KIND_VALUES[0];
};

const submitPlaceUpdate = async (
  locationId: string,
  placeId: string,
  payload: UpdatePlacePayload
) => {
  return locationClient.updateLocationPlace.mutate({
    locationId,
    placeId,
    description:
      payload.description === null
        ? ''
        : payload.description === undefined
          ? undefined
          : payload.description,
    kind: normalizeString(payload.kind),
    name: normalizeString(payload.name),
    tags: payload.tags ? normalizeTags(payload.tags) : undefined,
  });
};

export const useLocationMaintenanceStore = create<LocationMaintenanceStoreState>((set, get) => {
  return {
    addRelationship: async ({ kind, target }) => {
      const selectedPlaceId = get().selectedPlaceId;
      const rootId = get().selectedRootId;
      const sourceDetail = get().selectedDetail;
      if (!selectedPlaceId || !rootId || !sourceDetail) {
        return;
      }
      set({ error: null, isMutatingEdge: true });
      try {
        await locationClient.addLocationNeighborEdge.mutate({
          dstPlace: target,
          relationKind: normalizeEdgeKind(kind),
          locationId: rootId,
          srcPlace: sourceDetail.place,
        });
        set({ isMutatingEdge: false });
        await get().refreshGraph();
        await get().refreshGraph();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to add relationship.';
        set({ error: message, isMutatingEdge: false });
      }
    },
    clearError: () => set({ error: null }),
    createChildPlace: async ({ description, kind, name, tags }) => {
      const parent = get().selectedDetail?.place;
      const rootId = get().selectedRootId;
      if (!parent || !rootId) {
        return;
      }
      set({ error: null, isCreatingChild: true });
      const newPlace: LocationPlace = {
        id: generatePlaceId(),
        name: name.trim(),
        kind: kind.trim() || 'locale',
        description: normalizeString(description),
        tags: normalizeTags(tags),
        metadata: {},
      };
      try {
        await locationClient.addLocationNeighborEdge.mutate({
          locationId: rootId,
          relationKind: 'CONTAINS',
          srcPlace: parent,
          dstPlace: newPlace,
        });
        set({ isCreatingChild: false });
        await get().refreshGraph();
        await get().selectPlace(newPlace.id);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to create location.';
        set({ error: message, isCreatingChild: false });
      }
    },
    error: null,
    filters: defaultFilters,
    graph: null,
    graphCursor: null,
    hasMoreGraphChunks: false,
    hasMoreRoots: true,
    isCreatingChild: false,
    isLoadingGraph: false,
    isLoadingRoots: false,
    isMutatingEdge: false,
    isSavingPlace: false,
    loadRoots: async () => {
      set({
        error: null,
        hasMoreRoots: true,
        isLoadingRoots: true,
        roots: [],
        rootsCursor: null,
      });
      try {
        const connection = await fetchRootsPage();
        const roots = connection.items ?? [];
        set({
          isLoadingRoots: false,
          roots,
          rootsCursor: connection.nextCursor ?? null,
          hasMoreRoots: Boolean(connection.nextCursor),
        });
        if (roots.length > 0 && !get().selectedRootId) {
          await get().selectRoot(roots[0].id);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to load locations.';
        set({ error: message, isLoadingRoots: false });
      }
    },
    loadMoreRoots: async () => {
      const cursor = get().rootsCursor;
      if (!cursor || !get().hasMoreRoots || get().isLoadingRoots) {
        return;
      }
      set({ error: null, isLoadingRoots: true });
      try {
        const connection = await fetchRootsPage(cursor);
        set((state) => ({
          isLoadingRoots: false,
          roots: state.roots.concat(connection.items ?? []),
          rootsCursor: connection.nextCursor ?? null,
          hasMoreRoots: Boolean(connection.nextCursor),
        }));
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to load locations.';
        set({ error: message, isLoadingRoots: false });
      }
    },
    quickUpdatePlace: async (placeId, payload) => {
      set({ error: null });
      const rootId = get().selectedRootId;
      if (!rootId) return;
      try {
        const updatedPlace = await submitPlaceUpdate(rootId, placeId, payload);
        set((state) => ({
          selectedDetail:
            state.selectedDetail?.place.id === placeId
              ? { breadcrumb: state.selectedDetail.breadcrumb, place: updatedPlace }
              : state.selectedDetail,
        }));
        await get().refreshGraph();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to update location.';
        set({ error: message });
        throw error;
      }
    },
    refreshGraph: async () => {
      const rootId = get().selectedRootId;
      if (!rootId) {
        return;
      }
      set({
        error: null,
        graph: null,
        graphCursor: null,
        hasMoreGraphChunks: true,
        isLoadingGraph: true,
      });
      try {
        const connection = await fetchGraphPage(rootId);
        set({
          graph: mergeLocationGraphChunks(null, connection.items ?? []),
          graphCursor: connection.nextCursor ?? null,
          hasMoreGraphChunks: Boolean(connection.nextCursor),
          isLoadingGraph: false,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to load graph.';
        set({ error: message, isLoadingGraph: false });
      }
    },
    loadMoreGraphChunks: async () => {
      const rootId = get().selectedRootId;
      const cursor = get().graphCursor;
      if (!rootId || !cursor || !get().hasMoreGraphChunks || get().isLoadingGraph) {
        return;
      }
      set({ error: null, isLoadingGraph: true });
      try {
        const connection = await fetchGraphPage(rootId, cursor);
        set((state) => ({
          graph: mergeLocationGraphChunks(state.graph, connection.items ?? []),
          graphCursor: connection.nextCursor ?? null,
          hasMoreGraphChunks: Boolean(connection.nextCursor),
          isLoadingGraph: false,
        }));
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to load graph.';
        set({ error: message, isLoadingGraph: false });
      }
    },
    removeRelationship: async ({ kind, targetId }) => {
      const selectedPlaceId = get().selectedPlaceId;
      const rootId = get().selectedRootId;
      if (!selectedPlaceId || !rootId) {
        return;
      }
      set({ error: null, isMutatingEdge: true });
      try {
        await locationClient.removeLocationNeighborEdge.mutate({
          dstPlaceId: targetId,
          relationKind: normalizeEdgeKind(kind),
          locationId: rootId,
          srcPlaceId: selectedPlaceId,
        });
        set({ isMutatingEdge: false });
        await get().refreshGraph();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to remove relationship.';
        set({ error: message, isMutatingEdge: false });
      }
    },
    roots: [],
    rootsCursor: null,
    selectedDetail: null,
    selectedPlaceId: null,
    selectedRootId: null,
    selectPlace: async (placeId) => {
      set({ selectedPlaceId: placeId });
      const place = get().graph?.places.find((entry) => entry.id === placeId) ?? null;
      set({
        selectedDetail: place
          ? {
            breadcrumb: [{ id: place.id, kind: place.kind, name: place.name }],
            place,
          }
          : null,
      });
    },
    selectRoot: async (rootId) => {
      set({ selectedDetail: null, selectedPlaceId: null, selectedRootId: rootId });
      await get().refreshGraph();
    },
    setFilters: (updates) =>
      set((state) => ({
        filters: { ...state.filters, ...updates },
      })),
    updatePlace: async (payload) => {
      const selectedPlaceId = get().selectedPlaceId;
      const rootId = get().selectedRootId;
      if (!selectedPlaceId) {
        return;
      }
      set({ error: null, isSavingPlace: true });
      try {
        if (!rootId) {
          throw new Error('Select a location root first.');
        }
        const place = await submitPlaceUpdate(rootId, selectedPlaceId, payload);
        set((state) => ({
          isSavingPlace: false,
          selectedDetail:
            state.selectedDetail?.place.id === selectedPlaceId
              ? { breadcrumb: state.selectedDetail.breadcrumb, place }
              : state.selectedDetail,
        }));
        await get().refreshGraph();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to update location.';
        set({ error: message, isSavingPlace: false });
      }
    },
  };
});
