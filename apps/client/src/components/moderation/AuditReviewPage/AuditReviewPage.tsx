import { PROMPT_TEMPLATE_DESCRIPTORS } from '@glass-frontier/dto';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';

import { useCanModerate } from '../../../hooks/useUserRole';
import { useAuditReviewStore } from '../../../stores/auditReviewStore';
import { useChronicleStore } from '../../../stores/chronicleStore';
import './AuditReviewPage.css';
import { AuditQueuePanel } from './AuditQueuePanel';
import { ReviewDialog } from './ReviewDialog';

export function AuditReviewPage(): JSX.Element {
  const access = useModeratorAccess();
  const store = useAuditReviewState();
  const modal = useReviewModal(store.selectItem);
  useAuditReviewSync(access.canModerate, store.loadQueue);
  const detailTemplateLabel = useTemplateLabel(store.selectedItem);
  const reviewActions = useReviewActions(access.playerId, store.saveReview);

  if (!access.canModerate) {
    const redirectTarget = access.activeChronicleId ? `/chron/${access.activeChronicleId}` : '/';
    return <Navigate to={redirectTarget} replace />;
  }

  return (
    <AuditReviewLayout
      access={access}
      detailTemplateLabel={detailTemplateLabel}
      modal={modal}
      reviewActions={reviewActions}
      store={store}
    />
  );
}

const selectAuditReviewState = (state: ReturnType<typeof useAuditReviewStore.getState>) => ({
  cursor: state.cursor,
  detail: state.detail,
  draft: state.draft,
  error: state.error,
  filters: state.filters,
  isLoading: state.isLoading,
  isLoadingMore: state.isLoadingMore,
  items: state.items,
  loadMore: state.loadMore,
  loadQueue: state.loadQueue,
  saveReview: state.saveReview,
  selectedItem: state.selectedItem,
  selectItem: state.selectItem,
  setFilters: state.setFilters,
  updateDraft: state.updateDraft,
});

const useAuditReviewState = () => useAuditReviewStore(useShallow(selectAuditReviewState));

const useModeratorAccess = () => {
  const canModerate = useCanModerate();
  const playerId = useChronicleStore((state) => state.playerId);
  const activeChronicleId = useChronicleStore((state) => state.chronicleId);
  const navigate = useNavigate();
  const goBackToPlayerSurface = useCallback(() => {
    if (activeChronicleId) {
      void navigate(`/chron/${activeChronicleId}`);
    } else {
      void navigate('/');
    }
  }, [activeChronicleId, navigate]);
  return { activeChronicleId, canModerate, goBackToPlayerSurface, playerId };
};

const useReviewModal = (selectItem: (key: string | null) => Promise<void>) => {
  const [modalKey, setModalKey] = useState<string | null>(null);
  const openReview = useCallback(
    (storageKey: string) => {
      void selectItem(storageKey);
      setModalKey(storageKey);
    },
    [selectItem]
  );
  const closeReview = useCallback(() => {
    setModalKey(null);
    void selectItem(null);
  }, [selectItem]);
  return { closeReview, modalKey, openReview };
};

const useAuditReviewSync = (
  enabled: boolean,
  loadQueue: () => Promise<void>
) => {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    void loadQueue();
  }, [enabled, loadQueue]);
};

const useReviewActions = (
  playerId: string | null,
  saveReview: (playerId: string, status: 'in_progress' | 'completed') => Promise<void>
) => {
  const saveDraft = useCallback(() => {
    if (!playerId) {
      return;
    }
    void saveReview(playerId, 'in_progress');
  }, [playerId, saveReview]);
  const complete = useCallback(() => {
    if (!playerId) {
      return;
    }
    void saveReview(playerId, 'completed');
  }, [playerId, saveReview]);
  return { complete, saveDraft };
};

const useTemplateLabel = (selectedItem: ReturnType<typeof selectAuditReviewState>['selectedItem']) =>
  useMemo(() => {
    if (selectedItem?.templateId) {
      return PROMPT_TEMPLATE_DESCRIPTORS[selectedItem.templateId].label;
    }
    return selectedItem?.nodeId ?? 'Unknown';
  }, [selectedItem]);

type AuditReviewLayoutProps = {
  access: ReturnType<typeof useModeratorAccess>;
  detailTemplateLabel: string;
  modal: ReturnType<typeof useReviewModal>;
  reviewActions: ReturnType<typeof useReviewActions>;
  store: ReturnType<typeof useAuditReviewState>;
};

const AuditReviewLayout = ({
  access,
  detailTemplateLabel,
  modal,
  reviewActions,
  store,
}: AuditReviewLayoutProps) => (
  <div className="audit-page">
    <AuditReviewHeader
      goBackToPlayerSurface={access.goBackToPlayerSurface}
      isLoading={store.isLoading}
      onRefreshQueue={() => void store.loadQueue()}
    />
    {store.error ? <p className="audit-error">{store.error}</p> : null}
    <div className="audit-layout">
      <AuditQueuePanel
        cursor={store.cursor}
        filters={store.filters}
        isLoading={store.isLoading}
        isLoadingMore={store.isLoadingMore}
        items={store.items}
        onApplyFilters={() => void store.loadQueue()}
        onChangeFilters={store.setFilters}
        onLoadMore={() => void store.loadMore()}
        onOpenReview={modal.openReview}
      />
    </div>
    <ReviewDialog
      detail={store.detail}
      draft={store.draft}
      isOpen={Boolean(modal.modalKey)}
      isSaving={store.isLoading}
      playerId={access.playerId}
      onCancel={modal.closeReview}
      onComplete={reviewActions.complete}
      onSaveDraft={reviewActions.saveDraft}
      templateLabel={detailTemplateLabel}
      updateDraft={store.updateDraft}
    />
  </div>
);

type AuditReviewHeaderProps = {
  goBackToPlayerSurface: () => void;
  isLoading: boolean;
  onRefreshQueue: () => void;
};

const AuditReviewHeader = ({
  goBackToPlayerSurface,
  isLoading,
  onRefreshQueue,
}: AuditReviewHeaderProps) => (
  <header className="audit-page-header">
    <div>
      <h1>LLM Audit Review</h1>
      <p>Browse archived requests and capture moderator reviews.</p>
    </div>
    <div className="audit-header-actions">
      <button type="button" onClick={goBackToPlayerSurface}>
        Back to Chronicle
      </button>
      <button type="button" onClick={onRefreshQueue} disabled={isLoading}>
        {isLoading ? 'Refreshing…' : 'Refresh Queue'}
      </button>
    </div>
  </header>
);
