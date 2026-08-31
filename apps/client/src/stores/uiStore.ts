import { create } from 'zustand';

type ExpandedMessages = Record<string, boolean>;

type UiState = {
  worldGuideModalSlug: string | null;
  closeWorldGuide: () => void;
  closeBugReportModal: () => void;
  closeChangelogModal: () => void;
  closeCharacterDrawer: () => void;
  closeChronicleDrawer: () => void;
  closeGuideModal: () => void;
  closePlayerMenu: () => void;
  closePlayerSettingsModal: () => void;
  closeTemplateDrawer: () => void;
  expandedMessages: ExpandedMessages;
  isBugReportModalOpen: boolean;
  isChangelogModalOpen: boolean;
  isCharacterDrawerOpen: boolean;
  isChronicleDrawerOpen: boolean;
  isGuideModalOpen: boolean;
  isPlayerMenuOpen: boolean;
  isPlayerSettingsModalOpen: boolean;
  isTemplateDrawerOpen: boolean;
  openWorldGuide: (qualifiedSlug: string) => void;
  openBugReportModal: () => void;
  openChangelogModal: () => void;
  openGuideModal: () => void;
  openPlayerSettingsModal: () => void;
  resetExpandedMessages: () => void;
  setExpandedMessages: (
    next: ExpandedMessages | ((prev: ExpandedMessages) => ExpandedMessages)
  ) => void;
  toggleCharacterDrawer: () => void;
  toggleChronicleDrawer: () => void;
  toggleMessageExpansion: (entryId: string) => void;
  togglePlayerMenu: () => void;
  toggleTemplateDrawer: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  closeBugReportModal: () => set({ isBugReportModalOpen: false }),
  closeChangelogModal: () => set({ isChangelogModalOpen: false }),
  closeCharacterDrawer: () => set({ isCharacterDrawerOpen: false }),
  closeChronicleDrawer: () => set({ isChronicleDrawerOpen: false }),
  closeGuideModal: () => set({ isGuideModalOpen: false }),
  closePlayerMenu: () => set({ isPlayerMenuOpen: false }),
  closePlayerSettingsModal: () => set({ isPlayerSettingsModalOpen: false }),
  closeTemplateDrawer: () => set({ isTemplateDrawerOpen: false }),
  closeWorldGuide: () => set({ worldGuideModalSlug: null }),
  expandedMessages: {},
  isBugReportModalOpen: false,
  isChangelogModalOpen: false,
  isCharacterDrawerOpen: false,
  isChronicleDrawerOpen: false,
  isGuideModalOpen: false,
  isPlayerMenuOpen: false,
  isPlayerSettingsModalOpen: false,
  isTemplateDrawerOpen: false,
  openBugReportModal: () => set({ isBugReportModalOpen: true }),
  openChangelogModal: () => set({ isChangelogModalOpen: true }),
  openGuideModal: () => set({ isGuideModalOpen: true }),
  openPlayerSettingsModal: () => set({ isPlayerSettingsModalOpen: true }),
  openWorldGuide: (qualifiedSlug) => set({ worldGuideModalSlug: qualifiedSlug }),
  resetExpandedMessages: () => set({ expandedMessages: {} }),
  setExpandedMessages: (next) =>
    set((state) => ({
      expandedMessages:
        typeof next === 'function'
          ? (next as (prev: ExpandedMessages) => ExpandedMessages)(state.expandedMessages)
          : next,
    })),
  toggleCharacterDrawer: () =>
    set((state) => ({
      isCharacterDrawerOpen: !state.isCharacterDrawerOpen,
    })),
  toggleChronicleDrawer: () =>
    set((state) => ({
      isChronicleDrawerOpen: !state.isChronicleDrawerOpen,
    })),
  toggleMessageExpansion: (entryId) =>
    set((state) => ({
      expandedMessages: {
        ...state.expandedMessages,
        [entryId]: !(state.expandedMessages[entryId] ?? false),
      },
    })),
  togglePlayerMenu: () =>
    set((state) => ({
      isPlayerMenuOpen: !state.isPlayerMenuOpen,
    })),
  toggleTemplateDrawer: () =>
    set((state) => ({
      isTemplateDrawerOpen: !state.isTemplateDrawerOpen,
    })),
  worldGuideModalSlug: null,
}));
