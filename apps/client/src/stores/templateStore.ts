import type { PromptTemplateId } from '@glass-frontier/dto';
import { create } from 'zustand';

import { trpcClient } from '../lib/trpcClient';

type TemplateSummary = Awaited<ReturnType<typeof trpcClient.listPromptTemplates.query>>[number];
type TemplateDetail = Awaited<ReturnType<typeof trpcClient.getPromptTemplate.query>>;

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
  return summaries.reduce<Record<string, TemplateSummary>>((acc, summary) => {
    acc[summary.nodeId] = summary;
    return acc;
  }, {});
};

export const useTemplateStore = create<TemplateStoreState>()((set, get) => ({
  detail: null,
  draft: '',
  error: null,
  isDirty: false,
  isLoading: false,
  isSaving: false,
  async loadSummaries(loginId) {
    if (!loginId) {
      return;
    }
    set({ error: null, isLoading: true });
    try {
      const summaries = await trpcClient.listPromptTemplates.query({ loginId });
      set((prev) => ({
        detail:
          prev.selectedTemplateId &&
          summaries?.some((entry) => entry.nodeId === prev.selectedTemplateId)
            ? prev.detail
            : null,
        draft:
          prev.selectedTemplateId &&
          summaries?.some((entry) => entry.nodeId === prev.selectedTemplateId)
            ? prev.draft
            : '',
        error: null,
        isDirty:
          prev.selectedTemplateId &&
          summaries?.some((entry) => entry.nodeId === prev.selectedTemplateId)
            ? prev.isDirty
            : false,
        isLoading: false,
        selectedTemplateId:
          prev.selectedTemplateId &&
          summaries?.some((entry) => entry.nodeId === prev.selectedTemplateId)
            ? prev.selectedTemplateId
            : null,
        summaries: toRecord(summaries ?? []),
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load templates.',
        isLoading: false,
      });
    }
  },
  reset() {
    set({
      detail: null,
      draft: '',
      error: null,
      isDirty: false,
      selectedTemplateId: null,
    });
  },
  async revertTemplate(loginId) {
    const { selectedTemplateId } = get();
    if (!selectedTemplateId || !loginId) {
      return;
    }
    set({ error: null, isSaving: true });
    try {
      const next = await trpcClient.revertPromptTemplate.mutate({
        loginId,
        templateId: selectedTemplateId,
      });
      set((prev) => ({
        detail: next,
        draft: next.editable,
        isDirty: false,
        isSaving: false,
        summaries: {
          ...prev.summaries,
          [next.nodeId]: {
            activeSource: next.activeSource,
            activeVariantId: next.activeVariantId,
            description: next.description,
            hasOverride: next.hasOverride,
            label: next.label,
            nodeId: next.nodeId,
            supportsVariants: next.supportsVariants,
            updatedAt: next.updatedAt,
          },
        },
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to revert template.',
        isSaving: false,
      });
      throw error;
    }
  },
  async saveTemplate(loginId) {
    const { detail, draft, selectedTemplateId } = get();
    if (!detail || !selectedTemplateId || !loginId) {
      return;
    }
    set({ error: null, isSaving: true });
    try {
      const next = await trpcClient.savePromptTemplate.mutate({
        editable: draft,
        loginId,
        templateId: selectedTemplateId,
      });
      set((prev) => ({
        detail: next,
        draft: next.editable,
        isDirty: false,
        isSaving: false,
        summaries: {
          ...prev.summaries,
          [next.nodeId]: {
            activeSource: next.activeSource,
            activeVariantId: next.activeVariantId,
            description: next.description,
            hasOverride: next.hasOverride,
            label: next.label,
            nodeId: next.nodeId,
            supportsVariants: next.supportsVariants,
            updatedAt: next.updatedAt,
          },
        },
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to save template.',
        isSaving: false,
      });
      throw error;
    }
  },
  selectedTemplateId: null,
  async selectTemplate(templateId, loginId) {
    if (!templateId || !loginId) {
      set({ detail: null, draft: '', isDirty: false, selectedTemplateId: templateId ?? null });
      return;
    }
    set({ error: null, isLoading: true, selectedTemplateId: templateId });
    try {
      const detail = await trpcClient.getPromptTemplate.query({ loginId, templateId });
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
  },
  summaries: {},
  updateDraft(value) {
    const detail = get().detail;
    if (!detail) {
      return;
    }
    set({ draft: value, isDirty: value.trimEnd() !== detail.editable.trimEnd() });
  },
}));
