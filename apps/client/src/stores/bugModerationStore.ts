import type { BugReport, BugReportStatus } from '@glass-frontier/dto';
import { create } from 'zustand';

import { trpcClient } from '../lib/trpcClient';

export type BugModerationFilters = {
  query: string;
  statuses: BugReportStatus[];
};

type UpdatePayload = {
  adminNotes?: string | null;
  backlogItem?: string | null;
  reportId: string;
  status?: BugReportStatus;
};

type BugModerationStoreState = {
  error: string | null;
  filters: BugModerationFilters;
  isLoading: boolean;
  isSaving: boolean;
  reports: BugReport[];
  selectedReportId: string | null;
  loadReports: () => Promise<void>;
  refreshReports: () => Promise<void>;
  selectReport: (reportId: string | null) => void;
  setFilters: (updates: Partial<BugModerationFilters>) => void;
  updateReport: (payload: UpdatePayload) => Promise<BugReport>;
};

const defaultFilters: BugModerationFilters = {
  query: '',
  statuses: [],
};

export const useBugModerationStore = create<BugModerationStoreState>((set, get) => ({
  error: null,
  filters: defaultFilters,
  isLoading: false,
  isSaving: false,
  loadReports: async () => {
    set({ error: null, isLoading: true });
    try {
      const result = await trpcClient.listBugReports.query();
      set({ isLoading: false, reports: result.reports });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load bug reports.';
      set({ error: message, isLoading: false });
    }
  },
  refreshReports: async () => {
    await get().loadReports();
  },
  reports: [],
  selectedReportId: null,
  selectReport: (reportId) => set({ selectedReportId: reportId }),
  setFilters: (updates) =>
    set((state) => ({
      filters: {
        ...state.filters,
        ...updates,
      },
    })),
  updateReport: async ({ adminNotes, backlogItem, reportId, status }) => {
    set({ error: null, isSaving: true });
    try {
      const result = await trpcClient.updateBugReport.mutate({
        adminNotes,
        backlogItem,
        reportId,
        status,
      });
      set((state) => ({
        isSaving: false,
        reports: state.reports.map((report) =>
          report.id === reportId ? result.report : report
        ),
      }));
      return result.report;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to save bug report.';
      set({ error: message, isSaving: false });
      throw error;
    }
  },
}));
