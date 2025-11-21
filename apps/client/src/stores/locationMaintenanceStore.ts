import type {
  LocationBreadcrumbEntry,
  LocationEdgeKind,
  LocationPlace,
} from '@glass-frontier/dto';
import { create } from 'zustand';

import { locationClient } from '../lib/locationClient';

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

type RelationshipInput = {
  kind: LocationEdgeKind;
  targetId: string;
};

type ChildPlaceInput = {
  description?: string;
  kind: string;
  name: string;
  tags: string[];
};

type LocationDetails = {
  place: LocationPlace;
  breadcrumb: LocationBreadcrumbEntry[];
  children: LocationPlace[];
};

type LocationMaintenanceStoreState = {
  addRelationship: (input: RelationshipInput) => Promise<void>;
  clearError: () => void;
  createChildPlace: (input: ChildPlaceInput) => Promise<void>;
  error: string | null;
  filters: LocationFilters;
  locationDetails: LocationDetails | null;
  isCreatingChild: boolean;
  isLoadingDetails: boolean;
  isLoadingRoots: boolean;
  isMutatingEdge: boolean;
  isSavingPlace: boolean;
  loadRoots: () => Promise<void>;
  refreshLocationDetails: () => Promise<void>;
  removeRelationship: (input: RelationshipInput) => Promise<void>;
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

const submitPlaceUpdate = async (placeId: string, payload: UpdatePlacePayload) => {
  const place = await locationClient.upsertLocation.mutate({
    description:
      payload.description === null
        ? ''
        : payload.description === undefined
          ? undefined
          : payload.description,
    id: placeId,
    kind: normalizeString(payload.kind) ?? 'locale',
    name: normalizeString(payload.name) ?? 'Unknown',
    parentId: payload.parentId ?? null,
    tags: payload.tags ? normalizeTags(payload.tags) : undefined,
  });

  const breadcrumb = await locationClient.getLocationChain.query({ anchorId: place.id });
  return { breadcrumb, place };
};

export const useLocationMaintenanceStore = create<LocationMaintenanceStoreState>((set, get) => {
  return {
    addRelationship: async ({ kind, targetId }) => {
      const selectedPlaceId = get().selectedPlaceId;
      if (!selectedPlaceId) {
        return;
      }
      set({ error: null, isMutatingEdge: true });
      try {
        await locationClient.upsertEdge.mutate({
          dst: targetId,
          kind: normalizeEdgeKind(kind),
          metadata: { createdVia: 'maintenance-ui' },
          src: selectedPlaceId,
        });
        set({ isMutatingEdge: false });
        await get().refreshLocationDetails();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to add relationship.';
        set({ error: message, isMutatingEdge: false });
      }
    },
    clearError: () => set({ error: null }),
    createChildPlace: async ({ description, kind, name, tags }) => {
      const selectedPlaceId = get().selectedPlaceId;
      if (!selectedPlaceId) {
        return;
      }
      set({ error: null, isCreatingChild: true });
      try {
        const place = await locationClient.upsertLocation.mutate({
          description: normalizeString(description),
          kind,
          name,
          parentId: selectedPlaceId,
          tags: normalizeTags(tags),
        });
        set({ isCreatingChild: false });
        await get().refreshLocationDetails();
        await get().selectPlace(place.id);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to create location.';
        set({ error: message, isCreatingChild: false });
      }
    },
    error: null,
    filters: defaultFilters,
    locationDetails: null,
    isCreatingChild: false,
    isLoadingDetails: false,
    isLoadingRoots: false,
    isMutatingEdge: false,
    isSavingPlace: false,
    loadRoots: async () => {
      set({ error: null, isLoadingRoots: true });
      try {
        const roots = await locationClient.listLocationRoots.query({ limit: 100 });
        set({ isLoadingRoots: false, roots });
        if (roots.length > 0 && !get().selectedRootId) {
          await get().selectRoot(roots[0].id);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to load locations.';
        set({ error: message, isLoadingRoots: false });
      }
    },
    quickUpdatePlace: async (placeId, payload) => {
      set({ error: null });
      try {
        const detail = await submitPlaceUpdate(placeId, payload);
        set((state) => ({
          selectedDetail:
            state.selectedDetail?.place.id === placeId ? detail : state.selectedDetail,
        }));
        await get().refreshLocationDetails();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to update location.';
        set({ error: message });
        throw error;
      }
    },
    refreshLocationDetails: async () => {
      const rootId = get().selectedRootId;
      if (!rootId) {
        return;
      }
      set({ error: null, isLoadingDetails: true });
      try {
        const details = await locationClient.getLocationDetails.query({ id: rootId });
        set({ locationDetails: details, isLoadingDetails: false });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to load location details.';
        set({ error: message, isLoadingDetails: false });
      }
    },
    removeRelationship: async ({ kind, targetId }) => {
      const selectedPlaceId = get().selectedPlaceId;
      if (!selectedPlaceId) {
        return;
      }
      set({ error: null, isMutatingEdge: true });
      try {
        await locationClient.deleteEdge.mutate({
          dst: targetId,
          kind: normalizeEdgeKind(kind),
          src: selectedPlaceId,
        });
        set({ isMutatingEdge: false });
        await get().refreshLocationDetails();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to remove relationship.';
        set({ error: message, isMutatingEdge: false });
      }
    },
    roots: [],
    selectedDetail: null,
    selectedPlaceId: null,
    selectedRootId: null,
    selectPlace: async (placeId) => {
      set({ selectedPlaceId: placeId });
      try {
        const place = await locationClient.getPlace.query({ placeId });
        if (!place) {
          throw new Error('Location not found');
        }
        const breadcrumb = await locationClient.getLocationChain.query({ anchorId: placeId });
        set({ selectedDetail: { breadcrumb, place } });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to load location.';
        set({ error: message });
      }
    },
    selectRoot: async (rootId) => {
      set({ selectedDetail: null, selectedPlaceId: null, selectedRootId: rootId });
      await get().refreshLocationDetails();
    },
    setFilters: (updates) =>
      set((state) => ({
        filters: { ...state.filters, ...updates },
      })),
    updatePlace: async (payload) => {
      const selectedPlaceId = get().selectedPlaceId;
      if (!selectedPlaceId) {
        return;
      }
      set({ error: null, isSavingPlace: true });
      try {
        const place = await submitPlaceUpdate(selectedPlaceId, payload);
        set({ isSavingPlace: false, selectedDetail: place });
        await get().refreshLocationDetails();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to update location.';
        set({ error: message, isSavingPlace: false });
      }
    },
  };
});
