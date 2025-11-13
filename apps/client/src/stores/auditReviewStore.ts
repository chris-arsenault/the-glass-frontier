import type {
  AuditLogEntry,
  AuditProposalRecord,
  AuditQueueItem,
  AuditReviewRecord,
  AuditReviewStatus,
  AuditReviewTag,
  PromptTemplateId,
} from '@glass-frontier/dto';
import { create } from 'zustand';

import { promptClient } from '../lib/promptClient';

type ReviewDraft = {
  notes: string;
  tags: AuditReviewTag[];
};

export type AuditFilters = {
  status: AuditReviewStatus[];
  templateId: PromptTemplateId | null;
  playerId: string;
  search: string;
  startDate: string | null;
  endDate: string | null;
};

type AuditReviewStoreState = {
  filters: AuditFilters;
  items: AuditQueueItem[];
  cursor: string | null;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  selectedKey: string | null;
  selectedItem: AuditQueueItem | null;
  detail: AuditLogEntry | null;
  review: AuditReviewRecord | null;
  draft: ReviewDraft;
  proposals: AuditProposalRecord[];
  proposalLoading: boolean;
  proposalGenerating: boolean;
  setFilters: (next: Partial<AuditFilters>) => void;
  loadQueue: () => Promise<void>;
  loadMore: () => Promise<void>;
  selectItem: (storageKey: string | null) => Promise<void>;
  updateDraft: (updates: Partial<ReviewDraft>) => void;
  resetDraft: () => void;
  saveReview: (loginId: string, status: 'in_progress' | 'completed') => Promise<void>;
  refreshProposals: () => Promise<void>;
  generateProposals: () => Promise<void>;
};

const DEFAULT_QUEUE_LIMIT = 20;

const defaultFilters: AuditFilters = {
  endDate: null,
  playerId: '',
  search: '',
  startDate: null,
  status: [],
  templateId: null,
};

const createDraft = (): ReviewDraft => ({
  notes: '',
  tags: [],
});

const mergeItems = (original: AuditQueueItem[], next: AuditQueueItem[]): AuditQueueItem[] => {
  const map = new Map(original.map((item) => [item.storageKey, item]));
  for (const item of next) {
    map.set(item.storageKey, item);
  }
  return Array.from(map.values()).sort((a, b) => b.createdAtMs - a.createdAtMs);
};

const updateItemEntry = (
  items: AuditQueueItem[],
  auditId: string,
  updates: Partial<AuditQueueItem>
): AuditQueueItem[] => {
  return items.map((item) => (item.auditId === auditId ? { ...item, ...updates } : item));
};

export const useAuditReviewStore = create<AuditReviewStoreState>((set, get) => ({
  cursor: null,
  detail: null,
  draft: createDraft(),
  error: null,
  filters: defaultFilters,
  generateProposals: async () => {
    set({ error: null, proposalGenerating: true });
    try {
      await promptClient.generateAuditProposals.mutate({});
      set({ proposalGenerating: false });
      void get().refreshProposals();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Unable to generate proposals.',
        proposalGenerating: false,
      });
    }
  },
  isLoading: false,
  isLoadingMore: false,
  items: [],
  loadMore: async () => {
    const cursor = get().cursor;
    if (!cursor) {
      return;
    }
    set({ error: null, isLoadingMore: true });
    try {
      const { filters } = get();
      const result = await promptClient.listAuditQueue.query({
        cursor,
        endDate: filters.endDate ?? undefined,
        limit: DEFAULT_QUEUE_LIMIT,
        nodeId: undefined,
        playerId: filters.playerId || undefined,
        search: filters.search || undefined,
        startDate: filters.startDate ?? undefined,
        status: filters.status.length > 0 ? filters.status : undefined,
        templateId: filters.templateId ?? undefined,
      });
      set((state) => ({
        cursor: result.cursor ?? null,
        isLoadingMore: false,
        items: mergeItems(state.items, result.items),
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Unable to load additional items.',
        isLoadingMore: false,
      });
    }
  },
  loadQueue: async () => {
    set({ error: null, isLoading: true });
    try {
      const { filters } = get();
      const result = await promptClient.listAuditQueue.query({
        cursor: undefined,
        endDate: filters.endDate ?? undefined,
        limit: DEFAULT_QUEUE_LIMIT,
        nodeId: undefined,
        playerId: filters.playerId || undefined,
        search: filters.search || undefined,
        startDate: filters.startDate ?? undefined,
        status: filters.status.length > 0 ? filters.status : undefined,
        templateId: filters.templateId ?? undefined,
      });
      set({
        cursor: result.cursor ?? null,
        detail: null,
        draft: createDraft(),
        error: null,
        isLoading: false,
        isLoadingMore: false,
        items: result.items,
        review: null,
        selectedItem: null,
        selectedKey: null,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Unable to load audit queue.',
        isLoading: false,
        isLoadingMore: false,
      });
    }
  },
  proposalGenerating: false,
  proposalLoading: false,
  proposals: [],
  refreshProposals: async () => {
    set({ proposalLoading: true });
    try {
      const proposals = await promptClient.listAuditProposals.query();
      set({ proposalLoading: false, proposals });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Unable to load proposals.',
        proposalLoading: false,
      });
    }
  },
  resetDraft: () => set({ draft: createDraft(), review: null }),
  review: null,
  saveReview: async (loginId, status) => {
    const selectedKey = get().selectedKey;
    const detail = get().detail;
    if (!selectedKey || !detail) {
      return;
    }
    set({ error: null, isLoading: true });
    try {
      const draft = get().draft;
      const templateId = get().selectedItem?.templateId ?? null;
      const record = await promptClient.saveAuditReview.mutate({
        auditId: detail.id,
        loginId,
        nodeId: detail.nodeId ?? undefined,
        notes: draft.notes || undefined,
        reviewerName: undefined,
        status,
        storageKey: selectedKey,
        tags: draft.tags,
        templateId: templateId ?? undefined,
      });
      set((state) => ({
        draft: {
          notes: record.notes ?? '',
          tags: record.tags ?? [],
        },
        isLoading: false,
        items: updateItemEntry(state.items, record.auditId, {
          notes: record.notes ?? null,
          reviewerLoginId: record.reviewerLoginId,
          reviewerName: record.reviewerName ?? null,
          status: record.status,
          tags: record.tags ?? [],
          templateId: record.templateId ?? state.selectedItem?.templateId ?? null,
        }),
        review: record,
        selectedItem:
          state.selectedItem !== null
            ? { ...state.selectedItem, ...record }
            : state.selectedItem,
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Unable to save audit review.',
        isLoading: false,
      });
    }
  },
  selectedItem: null,
  selectedKey: null,
  selectItem: async (storageKey) => {
    if (storageKey === null) {
      set({
        detail: null,
        draft: createDraft(),
        review: null,
        selectedItem: null,
        selectedKey: null,
      });
      return;
    }
    set({ error: null });
    try {
      const detail = await promptClient.getAuditEntry.query({ storageKey });
      const selectedItem = get().items.find((item) => item.storageKey === storageKey) ?? null;
      const draft: ReviewDraft = {
        notes: detail.review?.notes ?? '',
        tags: detail.review?.tags ?? [],
      };
      set({
        detail: detail.entry,
        draft,
        review: detail.review ?? null,
        selectedItem,
        selectedKey: storageKey,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Unable to load audit details.',
      });
    }
  },
  setFilters: (next) =>
    set((state) => ({
      filters: {
        ...state.filters,
        ...next,
      },
    })),
  updateDraft: (updates) =>
    set((state) => ({
      draft: {
        ...state.draft,
        ...updates,
      },
    })),
}));
