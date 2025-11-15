import { PROMPT_TEMPLATE_DESCRIPTORS } from '@glass-frontier/dto';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';

import { useCanModerate } from '../../../hooks/useUserRole';
import { useAuditReviewStore } from '../../../stores/auditReviewStore';
import { useChronicleStore } from '../../../stores/chronicleStore';
import './AuditReviewPage.css';
import { AuditProposalsPanel } from './AuditProposalsPanel';
import { AuditQueuePanel } from './AuditQueuePanel';
import { ReviewDialog } from './ReviewDialog';

export function AuditReviewPage(): JSX.Element {
  const access = useModeratorAccess();
  const store = useAuditReviewState();
  const modal = useReviewModal(store.selectItem);
  useAuditReviewSync(access.canModerate, store.loadQueue, store.refreshProposals);
  const detailTemplateLabel = useTemplateLabel(store.selectedItem);
  const reviewActions = useReviewActions(access.loginId, store.saveReview);

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
  generateProposals: state.generateProposals,
  isLoading: state.isLoading,
  isLoadingMore: state.isLoadingMore,
  items: state.items,
  loadMore: state.loadMore,
  loadQueue: state.loadQueue,
  proposalGenerating: state.proposalGenerating,
  proposalLoading: state.proposalLoading,
  proposals: state.proposals,
  refreshProposals: state.refreshProposals,
  saveReview: state.saveReview,
  selectedItem: state.selectedItem,
  selectItem: state.selectItem,
  setFilters: state.setFilters,
  updateDraft: state.updateDraft,
});

const useAuditReviewState = () => useAuditReviewStore(useShallow(selectAuditReviewState));

const useModeratorAccess = () => {
  const canModerate = useCanModerate();
  const loginId = useChronicleStore((state) => state.loginId);
  const activeChronicleId = useChronicleStore((state) => state.chronicleId);
  const navigate = useNavigate();
  const goBackToPlayerSurface = useCallback(() => {
    if (activeChronicleId) {
      void navigate(`/chron/${activeChronicleId}`);
    } else {
      void navigate('/');
    }
  }, [activeChronicleId, navigate]);
  return { activeChronicleId, canModerate, goBackToPlayerSurface, loginId };
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
  loadQueue: () => Promise<void>,
  refreshProposals: () => Promise<void>
) => {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    void loadQueue();
    void refreshProposals();
  }, [enabled, loadQueue, refreshProposals]);
};

const useReviewActions = (
  loginId: string | null,
  saveReview: (loginId: string, status: 'in_progress' | 'completed') => Promise<void>
) => {
  const saveDraft = useCallback(() => {
    if (!loginId) {
      return;
    }
    void saveReview(loginId, 'in_progress');
  }, [loginId, saveReview]);
  const complete = useCallback(() => {
    if (!loginId) {
      return;
    }
    void saveReview(loginId, 'completed');
  }, [loginId, saveReview]);
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
      onGenerateProposals={() => void store.generateProposals()}
      onRefreshQueue={() => void store.loadQueue()}
      proposalGenerating={store.proposalGenerating}
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
      <AuditProposalsPanel
        proposals={store.proposals}
        proposalGenerating={store.proposalGenerating}
        proposalLoading={store.proposalLoading}
        onGenerate={() => void store.generateProposals()}
        onRefresh={() => void store.refreshProposals()}
      />
    </div>
    <ReviewDialog
      detail={store.detail}
      draft={store.draft}
      isOpen={Boolean(modal.modalKey)}
      isSaving={store.isLoading}
      loginId={access.loginId}
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
  onGenerateProposals: () => void;
  onRefreshQueue: () => void;
  proposalGenerating: boolean;
};

const AuditReviewHeader = ({
  goBackToPlayerSurface,
  isLoading,
  onGenerateProposals,
  onRefreshQueue,
  proposalGenerating,
}: AuditReviewHeaderProps) => (
  <header className="audit-page-header">
    <div>
      <h1>LLM Audit Review</h1>
      <p>Browse archived requests, capture moderator reviews, and inspect template proposals.</p>
    </div>
    <div className="audit-header-actions">
      <button type="button" onClick={goBackToPlayerSurface}>
        Back to Chronicle
      </button>
      <button type="button" onClick={onRefreshQueue} disabled={isLoading}>
        {isLoading ? 'Refreshing…' : 'Refresh Queue'}
      </button>
      <button type="button" onClick={onGenerateProposals} disabled={proposalGenerating}>
        {proposalGenerating ? 'Generating…' : 'Generate Proposals'}
      </button>
    </div>
  </header>
);
