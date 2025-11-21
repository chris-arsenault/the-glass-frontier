import type { LocationBreadcrumbEntry, LocationPlace } from '@glass-frontier/dto';
import { useCallback, useEffect, useState } from 'react';

import { locationClient } from '../../../../lib/locationClient';
import {
  useChronicleStartStore,
  type SelectedLocationSummary,
} from '../../../../stores/chronicleStartWizardStore';

export type LocationInspectorState = {
  place: LocationPlace | null;
  breadcrumb: LocationBreadcrumbEntry[];
};

type LocationDetails = {
  place: LocationPlace;
  breadcrumb: LocationBreadcrumbEntry[];
  children: LocationPlace[];
};

export type LocationExplorerState = {
  roots: LocationPlace[];
  rootError: string | null;
  isLoadingRoots: boolean;
  locationDetails: LocationDetails | null;
  graphError: string | null;
  isGraphLoading: boolean;
  activePlaceId: string | null;
  selectedRootId: string | null;
  inspector: LocationInspectorState;
  listViewFallback: boolean;
  setListViewFallback: (value: boolean) => void;
  selectRoot: (locationId: string) => Promise<void>;
  selectPlace: (placeId: string) => Promise<void>;
  bootstrapShardLocation: (stack: LocationBreadcrumbEntry[]) => Promise<string | null>;
  refreshRoots: () => Promise<void>;
};

const buildSelectedLocation = (place: LocationPlace, breadcrumb: LocationBreadcrumbEntry[]): SelectedLocationSummary => ({
  breadcrumb,
  id: place.id,
  name: place.name,
});

export const useLocationExplorer = (): LocationExplorerState => {
  const [roots, setRoots] = useState<LocationPlace[]>([]);
  const [rootError, setRootError] = useState<string | null>(null);
  const [isLoadingRoots, setIsLoadingRoots] = useState(false);
  const [locationDetails, setLocationDetails] = useState<LocationDetails | null>(null);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [isGraphLoading, setIsGraphLoading] = useState(false);
  const [activePlaceId, setActivePlaceId] = useState<string | null>(null);
  const [selectedRootId, setSelectedRootId] = useState<string | null>(null);
  const [inspector, setInspector] = useState<LocationInspectorState>({
    breadcrumb: [],
    place: null,
  });

  const listViewFallback = useChronicleStartStore((state) => state.listViewFallback);
  const setListViewFallback = useChronicleStartStore((state) => state.setListViewFallback);
  const setSelectedLocation = useChronicleStartStore((state) => state.setSelectedLocation);

  const selectPlace = useCallback(
    async (placeId: string) => {
      setActivePlaceId(placeId);
      try {
        const place = await locationClient.getPlace.query({ placeId });
        if (!place) {
          throw new Error('Location not found');
        }
        const breadcrumb = await locationClient.getLocationChain.query({ anchorId: placeId });
        setInspector({ breadcrumb, place });
        setSelectedLocation(buildSelectedLocation(place, breadcrumb));
        setGraphError(null);
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Failed to load location details.';
        setInspector({ breadcrumb: [], place: null });
        setSelectedLocation(null);
        setGraphError(message);
      }
    },
    [setSelectedLocation]
  );

  const loadGraph = useCallback(
    async (locationId: string) => {
      setIsGraphLoading(true);
      setGraphError(null);
      try {
        const details = await locationClient.getLocationDetails.query({ id: locationId });
        setLocationDetails(details);
        setActivePlaceId(locationId);
        await selectPlace(locationId);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to load graph.';
        setGraphError(message);
      } finally {
        setIsGraphLoading(false);
      }
    },
    [selectPlace]
  );

  const selectRoot = useCallback(
    async (locationId: string) => {
      setSelectedRootId(locationId);
      await loadGraph(locationId);
    },
    [loadGraph]
  );

  const loadRoots = useCallback(async () => {
    setIsLoadingRoots(true);
    setRootError(null);
    try {
      const locations = await locationClient.listLocationRoots.query({ limit: 100 });
      setRoots(locations);
      if (!selectedRootId && locations.length) {
        void selectRoot(locations[0].id);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load locations.';
      setRootError(message);
    } finally {
      setIsLoadingRoots(false);
    }
  }, [selectRoot, selectedRootId]);

  useEffect(() => {
    void loadRoots().catch(() => undefined);
  }, [loadRoots]);

  const bootstrapShardLocation = useCallback(
    async (stack: LocationBreadcrumbEntry[]): Promise<string | null> => {
      if (!stack.length) {
        return null;
      }
      const knownIndex = [...stack].reverse().findIndex((entry) => entry.id);
      let parentId: string | null = null;
      let baseIndex = 0;
      if (knownIndex >= 0) {
        const realIndex = stack.length - 1 - knownIndex;
        parentId = stack[realIndex].id;
        baseIndex = realIndex + 1;
      }
      const pending = stack.slice(baseIndex);
      if (!pending.length && parentId) {
        return parentId;
      }
      if (!pending.length) {
        return null;
      }

      // Create locations one by one in sequence
      let currentParentId = parentId;
      let lastPlaceId: string | null = null;

      for (const entry of pending) {
        // eslint-disable-next-line no-await-in-loop
        const place = await locationClient.upsertLocation.mutate({
          kind: entry.kind,
          name: entry.name,
          parentId: currentParentId,
          tags: [],
        });
        lastPlaceId = place.id;
        currentParentId = place.id;
      }

      if (lastPlaceId) {
        // Load the root location details
        const place = await locationClient.getPlace.query({ placeId: lastPlaceId });
        if (place) {
          await loadGraph(place.locationId);
        }
        return lastPlaceId;
      }

      return null;
    },
    [loadGraph]
  );

  return {
    activePlaceId,
    bootstrapShardLocation,
    locationDetails,
    graphError,
    inspector,
    isGraphLoading,
    isLoadingRoots,
    listViewFallback,
    refreshRoots: loadRoots,
    rootError,
    roots,
    selectedRootId,
    selectPlace,
    selectRoot,
    setListViewFallback,
  };
};
