import { create } from "zustand";
import type { PromptTemplateId } from "@glass-frontier/dto";
import { trpcClient } from "../lib/trpcClient";

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
  summaries: {},
  selectedTemplateId: null,
  detail: null,
  draft: "",
  isLoading: false,
  isSaving: false,
  error: null,
  isDirty: false,
  async loadSummaries(loginId) {
    if (!loginId) {
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const summaries = await trpcClient.listPromptTemplates.query({ loginId });
      set((prev) => ({
        summaries: toRecord(summaries ?? []),
        isLoading: false,
        error: null,
        selectedTemplateId:
          prev.selectedTemplateId && summaries?.some((entry) => entry.nodeId === prev.selectedTemplateId)
            ? prev.selectedTemplateId
            : null,
        detail:
          prev.selectedTemplateId && summaries?.some((entry) => entry.nodeId === prev.selectedTemplateId)
            ? prev.detail
            : null,
        draft:
          prev.selectedTemplateId && summaries?.some((entry) => entry.nodeId === prev.selectedTemplateId)
            ? prev.draft
            : "",
        isDirty:
          prev.selectedTemplateId && summaries?.some((entry) => entry.nodeId === prev.selectedTemplateId)
            ? prev.isDirty
            : false
      }));
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to load templates."
      });
    }
  },
  async selectTemplate(templateId, loginId) {
    if (!templateId || !loginId) {
      set({ selectedTemplateId: templateId ?? null, detail: null, draft: "", isDirty: false });
      return;
    }
    set({ isLoading: true, error: null, selectedTemplateId: templateId });
    try {
      const detail = await trpcClient.getPromptTemplate.query({ loginId, templateId });
      set({
        detail,
        draft: detail?.editable ?? "",
        isDirty: false,
        isLoading: false,
        error: null
      });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : "Unable to load template."
      });
    }
  },
  updateDraft(value) {
    const detail = get().detail;
    if (!detail) {
      return;
    }
    set({ draft: value, isDirty: value.trimEnd() !== detail.editable.trimEnd() });
  },
  async saveTemplate(loginId) {
    const { detail, draft, selectedTemplateId } = get();
    if (!detail || !selectedTemplateId || !loginId) {
      return;
    }
    set({ isSaving: true, error: null });
    try {
      const next = await trpcClient.savePromptTemplate.mutate({
        loginId,
        templateId: selectedTemplateId,
        editable: draft
      });
      set((prev) => ({
        detail: next,
        draft: next.editable,
        isDirty: false,
        isSaving: false,
        summaries: {
          ...prev.summaries,
          [next.nodeId]: {
            nodeId: next.nodeId,
            label: next.label,
            description: next.description,
            activeSource: next.activeSource,
            activeVariantId: next.activeVariantId,
            updatedAt: next.updatedAt,
            supportsVariants: next.supportsVariants,
            hasOverride: next.hasOverride
          }
        }
      }));
    } catch (error) {
      set({
        isSaving: false,
        error: error instanceof Error ? error.message : "Failed to save template."
      });
      throw error;
    }
  },
  async revertTemplate(loginId) {
    const { selectedTemplateId } = get();
    if (!selectedTemplateId || !loginId) {
      return;
    }
    set({ isSaving: true, error: null });
    try {
      const next = await trpcClient.revertPromptTemplate.mutate({
        loginId,
        templateId: selectedTemplateId
      });
      set((prev) => ({
        detail: next,
        draft: next.editable,
        isDirty: false,
        isSaving: false,
        summaries: {
          ...prev.summaries,
          [next.nodeId]: {
            nodeId: next.nodeId,
            label: next.label,
            description: next.description,
            activeSource: next.activeSource,
            activeVariantId: next.activeVariantId,
            updatedAt: next.updatedAt,
            supportsVariants: next.supportsVariants,
            hasOverride: next.hasOverride
          }
        }
      }));
    } catch (error) {
      set({
        isSaving: false,
        error: error instanceof Error ? error.message : "Failed to revert template."
      });
      throw error;
    }
  },
  reset() {
    set({
      selectedTemplateId: null,
      detail: null,
      draft: "",
      isDirty: false,
      error: null
    });
  }
}));
