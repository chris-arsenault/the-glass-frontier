import type {
  LocationBreadcrumbEntry,
  LocationGraphSnapshot,
  LocationPlace,
} from '@glass-frontier/dto';
import { useCallback, useEffect, useState } from 'react';

import { locationClient } from '../../../../lib/locationClient';
import {
  useChronicleStartStore,
  type SelectedLocationSummary,
} from '../../../../stores/chronicleStartWizardStore';

export type LocationInspectorState = {
  place: LocationPlace | null;
  breadcrumb: LocationBreadcrumbEntry[];
}

export type LocationExplorerState = {
  roots: LocationPlace[];
  rootError: string | null;
  isLoadingRoots: boolean;
  graph: LocationGraphSnapshot | null;
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
}

const buildSelectedLocation = (
  details: Awaited<ReturnType<typeof locationClient.getLocationPlace.query>>
): SelectedLocationSummary => ({
  breadcrumb: details.breadcrumb,
  id: details.place.id,
  name: details.place.name,
});

export const useLocationExplorer = (): LocationExplorerState => {
  const [roots, setRoots] = useState<LocationPlace[]>([]);
  const [rootError, setRootError] = useState<string | null>(null);
  const [isLoadingRoots, setIsLoadingRoots] = useState(false);
  const [graph, setGraph] = useState<LocationGraphSnapshot | null>(null);
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
        const details = await locationClient.getLocationPlace.query({ placeId });
        setInspector({ breadcrumb: details.breadcrumb, place: details.place });
        setSelectedLocation(buildSelectedLocation(details));
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
        const snapshot = await locationClient.getLocationGraph.query({ locationId });
        setGraph(snapshot);
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
      const locations = await locationClient.listLocations.query({ limit: 100 });
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
      let parentId: string | undefined;
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
      const segments = pending.map((entry) => ({
        description: undefined,
        kind: entry.kind,
        name: entry.name,
        tags: [],
      }));
      const result = await locationClient.createLocationChain.mutate({
        parentId,
        segments,
      });
      await loadGraph(result.anchor.locationId);
      return result.anchor.id;
    },
    [loadGraph]
  );

  return {
    activePlaceId,
    bootstrapShardLocation,
    graph,
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
