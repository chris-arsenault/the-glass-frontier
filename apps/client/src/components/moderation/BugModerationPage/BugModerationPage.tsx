import React, { useEffect, useMemo } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';

import { useCanModerate } from '../../../hooks/useUserRole';
import { useChronicleStore } from '../../../stores/chronicleStore';
import { useBugModerationStore } from '../../../stores/bugModerationStore';
import './BugModerationPage.css';
import { BugReportDetailDialog } from './BugReportDetailDialog';
import { BugReportsGrid } from './BugReportsGrid';

const selectBugModerationState = (state: ReturnType<typeof useBugModerationStore.getState>) => ({
  error: state.error,
  filters: state.filters,
  isLoading: state.isLoading,
  isSaving: state.isSaving,
  loadReports: state.loadReports,
  reports: state.reports,
  selectReport: state.selectReport,
  selectedReportId: state.selectedReportId,
  setFilters: state.setFilters,
  updateReport: state.updateReport,
});

export function BugModerationPage(): JSX.Element {
  const canModerate = useCanModerate();
  const chronicleId = useChronicleStore((state) => state.chronicleId);
  const navigate = useNavigate();
  const {
    error,
    filters,
    isLoading,
    isSaving,
    loadReports,
    reports,
    selectReport,
    selectedReportId,
    setFilters,
    updateReport,
  } = useBugModerationStore(useShallow(selectBugModerationState));

  useEffect(() => {
    if (!canModerate) {
      return;
    }
    void loadReports();
  }, [canModerate, loadReports]);

  const selectedReport = useMemo(() => {
    if (!selectedReportId) {
      return null;
    }
    return reports.find((report) => report.id === selectedReportId) ?? null;
  }, [reports, selectedReportId]);

  if (!canModerate) {
    const redirectTarget = chronicleId ? `/chron/${chronicleId}` : '/';
    return <Navigate to={redirectTarget} replace />;
  }

  const handleBackToChronicle = () => {
    if (chronicleId) {
      void navigate(`/chron/${chronicleId}`);
    } else {
      void navigate('/');
    }
  };

  const handleCloseDialog = () => {
    selectReport(null);
  };

  const handleSaveDetail = async (payload: {
    adminNotes: string | null;
    backlogItem: string | null;
    status: BugReportStatus;
  }) => {
    if (!selectedReportId) {
      return;
    }
    await updateReport({
      adminNotes: payload.adminNotes,
      backlogItem: payload.backlogItem,
      reportId: selectedReportId,
      status: payload.status,
    });
  };

  return (
    <div className="bug-page">
      <header className="bug-page-header">
        <div>
          <h1>Bug Moderation</h1>
          <p>Review player bug submissions, capture admin notes, and prioritize follow-up.</p>
        </div>
        <div className="bug-page-actions">
          <button type="button" onClick={handleBackToChronicle}>
            Back to Chronicle
          </button>
          <button type="button" onClick={() => void loadReports()} disabled={isLoading}>
            {isLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>
      {error ? (
        <p className="bug-page-error" role="alert">
          {error}
        </p>
      ) : null}
      <BugReportsGrid
        filters={filters}
        isLoading={isLoading}
        onFilterChange={setFilters}
        onSelectReport={(reportId) => selectReport(reportId)}
        reports={reports}
        selectedReportId={selectedReportId}
      />
      <BugReportDetailDialog
        error={error}
        isOpen={Boolean(selectedReportId)}
        isSaving={isSaving}
        onClose={handleCloseDialog}
        onSave={async ({ adminNotes, backlogItem, status }) => {
          await handleSaveDetail({ adminNotes, backlogItem, status });
        }}
        report={selectedReport}
      />
    </div>
  );
}
import type { BugReportStatus } from '@glass-frontier/dto';
