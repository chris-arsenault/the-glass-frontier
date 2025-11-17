import type {
  LocationBreadcrumbEntry,
  LocationGraphSnapshot,
  LocationPlace,
} from '@glass-frontier/worldstate/dto';
import { useCallback, useEffect, useState } from 'react';

import { locationClient } from '../../../../lib/locationClient';
import { resolveLoginIdentity } from '../../../../utils/loginIdentity';
import { mergeLocationGraphChunks } from '../../../../utils/locationGraph';
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
  loadMoreRoots: () => Promise<void>;
  hasMoreRoots: boolean;
  loadMoreGraphChunks: () => Promise<void>;
  hasMoreGraphChunks: boolean;
}

const buildSelectedLocation = (
  summary: Awaited<ReturnType<typeof locationClient.getLocation.query>>
): SelectedLocationSummary | null => {
  if (!summary) {
    return null;
  }
  return {
    breadcrumb: summary.breadcrumb,
    id: summary.anchorPlaceId,
    name: summary.name,
  };
};

const ROOT_PAGE_LIMIT = 25;
const GRAPH_CHUNK_LIMIT = 25;

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

export const useLocationExplorer = (): LocationExplorerState => {
  const [roots, setRoots] = useState<LocationPlace[]>([]);
  const [rootError, setRootError] = useState<string | null>(null);
  const [isLoadingRoots, setIsLoadingRoots] = useState(false);
  const [rootsCursor, setRootsCursor] = useState<string | null>(null);
  const [hasMoreRoots, setHasMoreRoots] = useState(true);
  const [graph, setGraph] = useState<LocationGraphSnapshot | null>(null);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [isGraphLoading, setIsGraphLoading] = useState(false);
  const [activePlaceId, setActivePlaceId] = useState<string | null>(null);
  const [graphCursor, setGraphCursor] = useState<string | null>(null);
  const [hasMoreGraphChunks, setHasMoreGraphChunks] = useState(false);
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
      const place =
        graph?.places.find((entry) => entry.id === placeId) ??
        null;
      if (place) {
        const breadcrumb = [{ id: place.id, kind: place.kind, name: place.name }];
        setInspector({ breadcrumb, place });
        setSelectedLocation({
          breadcrumb,
          id: place.id,
          name: place.name,
        });
        setGraphError(null);
      } else {
        setInspector({ breadcrumb: [], place: null });
        setSelectedLocation(null);
        setGraphError('Location not found in graph.');
      }
    },
    [graph, setSelectedLocation]
  );

  const loadGraph = useCallback(
    async (locationId: string) => {
      setIsGraphLoading(true);
      setGraphError(null);
      setGraph(null);
      setGraphCursor(null);
      setHasMoreGraphChunks(true);
      try {
        const connection = await fetchGraphPage(locationId);
        setGraph(mergeLocationGraphChunks(null, connection.items ?? []));
        setGraphCursor(connection.nextCursor ?? null);
        setHasMoreGraphChunks(Boolean(connection.nextCursor));
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

  const loadMoreGraph = useCallback(async () => {
    if (!selectedRootId || !graphCursor || !hasMoreGraphChunks || isGraphLoading) {
      return;
    }
    setIsGraphLoading(true);
    setGraphError(null);
    try {
      const connection = await fetchGraphPage(selectedRootId, graphCursor);
      setGraph((prev) => mergeLocationGraphChunks(prev, connection.items ?? []));
      setGraphCursor(connection.nextCursor ?? null);
      setHasMoreGraphChunks(Boolean(connection.nextCursor));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load graph.';
      setGraphError(message);
    } finally {
      setIsGraphLoading(false);
    }
  }, [graphCursor, hasMoreGraphChunks, isGraphLoading, selectedRootId]);

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
    setHasMoreRoots(true);
    setRootsCursor(null);
    setRoots([]);
    try {
      const connection = await fetchRootsPage();
      const locations = connection.items ?? [];
      setRoots(locations);
      setRootsCursor(connection.nextCursor ?? null);
      setHasMoreRoots(Boolean(connection.nextCursor));
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

  const loadMoreRoots = useCallback(async () => {
    if (!hasMoreRoots || !rootsCursor || isLoadingRoots) {
      return;
    }
    setIsLoadingRoots(true);
    setRootError(null);
    try {
      const connection = await fetchRootsPage(rootsCursor);
      const locations = connection.items ?? [];
      setRoots((prev) => prev.concat(locations));
      setRootsCursor(connection.nextCursor ?? null);
      setHasMoreRoots(Boolean(connection.nextCursor));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load locations.';
      setRootError(message);
    } finally {
      setIsLoadingRoots(false);
    }
  }, [hasMoreRoots, isLoadingRoots, rootsCursor]);

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
    hasMoreGraphChunks,
    hasMoreRoots,
    inspector,
    isGraphLoading,
    isLoadingRoots,
    listViewFallback,
    loadMoreGraphChunks: loadMoreGraph,
    loadMoreRoots,
    refreshRoots: loadRoots,
    rootError,
    roots,
    selectedRootId,
    selectPlace,
    selectRoot,
    setListViewFallback,
  };
};
