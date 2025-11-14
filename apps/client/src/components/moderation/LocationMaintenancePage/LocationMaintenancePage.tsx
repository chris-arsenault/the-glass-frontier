import type {
  LocationEdgeKind as LocationEdgeKindType,
  LocationPlace,
} from '@glass-frontier/dto';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';

import { useCanModerate } from '../../../hooks/useUserRole';
import { useChronicleStore } from '../../../stores/chronicleStore';
import { useLocationMaintenanceStore } from '../../../stores/locationMaintenanceStore';
import { CreateChildDialog } from './CreateChildDialog';
import { DescriptionDialog } from './DescriptionDialog';
import { LocationGridPanel, type LocationGridRow } from './LocationGridPanel';
import { buildPlaceMap } from './locationUtils';
import { RelationshipDialog } from './RelationshipDialog';
import { RootSelectorBar } from './RootSelectorBar';
import './LocationMaintenancePage.css';

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

  const activeChronicleId = useChronicleStore((state) => state.chronicleId);
  const goBackToPlayerSurface = useCallback(() => {
    if (activeChronicleId) {
      void navigate(`/chronicle/${activeChronicleId}`);
    } else {
      void navigate('/');
    }
  }, [activeChronicleId, navigate]);

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
    const redirectTarget = activeChronicleId ? `/chronicle/${activeChronicleId}` : '/';
    return <Navigate to={redirectTarget} replace />;
  }

  const childDialogParent: LocationPlace | null = childParentId
    ? placeMap.get(childParentId) ?? null
    : null;

  const descriptionDialogPlace: LocationPlace | null = descriptionPlaceId
    ? placeMap.get(descriptionPlaceId) ?? null
    : null;

  return (
    <div className="lm-page">
      <header className="lm-page-header">
        <div>
          <h1>Location Maintenance</h1>
          <p>Review, edit, and connect locations across the world graph.</p>
        </div>
        <div className="lm-page-actions">
          <button type="button" onClick={goBackToPlayerSurface}>Back to Chronicle</button>
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
        onChange={setDescriptionDraft}
        onClose={handleCloseDescription}
        onSave={() => void handleSaveDescription()}
        open={Boolean(descriptionPlaceId)}
        place={descriptionDialogPlace}
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
