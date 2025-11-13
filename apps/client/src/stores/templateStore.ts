import type { PromptTemplateId } from '@glass-frontier/dto';
import { create } from 'zustand';

import { promptClient } from '../lib/promptClient';

type TemplateSummary = Awaited<ReturnType<typeof promptClient.listPromptTemplates.query>>[number];
type TemplateDetail = Awaited<ReturnType<typeof promptClient.getPromptTemplate.query>>;

type TemplateStoreSet = (
  partial:
    | TemplateStoreState
    | Partial<TemplateStoreState>
    | ((state: TemplateStoreState) => TemplateStoreState | Partial<TemplateStoreState>),
  replace?: boolean
) => void;

type TemplateStoreGet = () => TemplateStoreState;

const isNonEmptyString = (value: string | null | undefined): value is string => {
  return typeof value === 'string' && value.trim().length > 0;
};

const toTemplateSummary = (detail: TemplateDetail): TemplateSummary => {
  return {
    activeSource: detail.activeSource,
    activeVariantId: detail.activeVariantId,
    description: detail.description,
    hasOverride: detail.hasOverride,
    label: detail.label,
    nodeId: detail.nodeId,
    supportsVariants: detail.supportsVariants,
    updatedAt: detail.updatedAt,
  };
};

const computeSelectionState = (
  prev: TemplateStoreState,
  summaries: TemplateSummary[]
): Pick<TemplateStoreState, 'detail' | 'draft' | 'isDirty' | 'selectedTemplateId'> => {
  if (prev.selectedTemplateId === null) {
    return {
      detail: null,
      draft: '',
      isDirty: false,
      selectedTemplateId: null,
    };
  }

  const stillExists = summaries.some((entry) => entry.nodeId === prev.selectedTemplateId);
  if (stillExists) {
    return {
      detail: prev.detail,
      draft: prev.draft,
      isDirty: prev.isDirty,
      selectedTemplateId: prev.selectedTemplateId,
    };
  }

  return {
    detail: null,
    draft: '',
    isDirty: false,
    selectedTemplateId: null,
  };
};

const applyDetailUpdate = (set: TemplateStoreSet, detail: TemplateDetail): void => {
  set((prev) => ({
    detail,
    draft: detail.editable,
    isDirty: false,
    isSaving: false,
    summaries: {
      ...prev.summaries,
      [detail.nodeId]: toTemplateSummary(detail),
    },
  }));
};

type TemplateStoreState = {
  summaries: Record<string, TemplateSummary>;
  selectedTemplateId: PromptTemplateId | null;
  detail: TemplateDetail | null;
  draft: string;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  isDirty: boolean;
  loadSummaries: (loginId: string) => Promise<void>;
  selectTemplate: (templateId: PromptTemplateId | null, loginId: string) => Promise<void>;
  updateDraft: (value: string) => void;
  saveTemplate: (loginId: string) => Promise<void>;
  revertTemplate: (loginId: string) => Promise<void>;
  reset: () => void;
};

const toRecord = (summaries: TemplateSummary[]): Record<string, TemplateSummary> => {
  const record: Record<string, TemplateSummary> = {};
  for (const summary of summaries) {
    record[summary.nodeId] = summary;
  }
  return record;
};

const createLoadSummariesHandler = (set: TemplateStoreSet) => {
  return async (loginId: string): Promise<void> => {
    if (!isNonEmptyString(loginId)) {
      return;
    }

    set({ error: null, isLoading: true });

    try {
      const summaries = await promptClient.listPromptTemplates.query({ loginId });
      const summaryList = summaries ?? [];

      set((prev) => ({
        ...computeSelectionState(prev, summaryList),
        error: null,
        isLoading: false,
        summaries: toRecord(summaryList),
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load templates.',
        isLoading: false,
      });
    }
  };
};

const createRevertTemplateHandler = (set: TemplateStoreSet, get: TemplateStoreGet) => {
  return async (loginId: string): Promise<void> => {
    const selectedTemplateId = get().selectedTemplateId;
    if (selectedTemplateId === null || !isNonEmptyString(loginId)) {
      return;
    }

    set({ error: null, isSaving: true });

    try {
      const next = await promptClient.revertPromptTemplate.mutate({
        loginId,
        templateId: selectedTemplateId,
      });
      applyDetailUpdate(set, next);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to revert template.',
        isSaving: false,
      });
      throw error;
    }
  };
};

const createSaveTemplateHandler = (set: TemplateStoreSet, get: TemplateStoreGet) => {
  return async (loginId: string): Promise<void> => {
    const { detail, draft, selectedTemplateId } = get();
    if (detail === null || selectedTemplateId === null || !isNonEmptyString(loginId)) {
      return;
    }

    set({ error: null, isSaving: true });

    try {
      const next = await promptClient.savePromptTemplate.mutate({
        editable: draft,
        loginId,
        templateId: selectedTemplateId,
      });
      applyDetailUpdate(set, next);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to save template.',
        isSaving: false,
      });
      throw error;
    }
  };
};

const createSelectTemplateHandler = (set: TemplateStoreSet) => {
  return async (templateId: PromptTemplateId | null, loginId: string): Promise<void> => {
    if (templateId === null || !isNonEmptyString(loginId)) {
      set({ detail: null, draft: '', isDirty: false, selectedTemplateId: templateId ?? null });
      return;
    }

    set({ error: null, isLoading: true, selectedTemplateId: templateId });

    try {
      const detail = await promptClient.getPromptTemplate.query({ loginId, templateId });
      set({
        detail,
        draft: detail?.editable ?? '',
        error: null,
        isDirty: false,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Unable to load template.',
        isLoading: false,
      });
    }
  };
};

export const useTemplateStore = create<TemplateStoreState>()((set, get) => ({
  detail: null,
  draft: '',
  error: null,
  isDirty: false,
  isLoading: false,
  isSaving: false,
  loadSummaries: createLoadSummariesHandler(set),
  reset() {
    set({
      detail: null,
      draft: '',
      error: null,
      isDirty: false,
      selectedTemplateId: null,
    });
  },
  revertTemplate: createRevertTemplateHandler(set, get),
  saveTemplate: createSaveTemplateHandler(set, get),
  selectedTemplateId: null,
  selectTemplate: createSelectTemplateHandler(set),
  summaries: {},
  updateDraft(value) {
    const detail = get().detail;
    if (detail === null) {
      return;
    }
    set({ draft: value, isDirty: value.trimEnd() !== detail.editable.trimEnd() });
  },
}));
