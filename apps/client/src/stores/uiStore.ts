import { create } from 'zustand';

type ExpandedMessages = Record<string, boolean>;

type UiState = {
  closeBugReportModal: () => void;
  closeChangelogModal: () => void;
  closeCharacterDrawer: () => void;
  closeCreateCharacterModal: () => void;
  closeGuideModal: () => void;
  closePlayerMenu: () => void;
  closePlayerSettingsModal: () => void;
  closePlayerMenu: () => void;
  closeTemplateDrawer: () => void;
  expandedMessages: ExpandedMessages;
  isBugReportModalOpen: boolean;
  isChangelogModalOpen: boolean;
  isCharacterDrawerOpen: boolean;
  isCreateCharacterModalOpen: boolean;
  isGuideModalOpen: boolean;
  isPlayerMenuOpen: boolean;
  isPlayerSettingsModalOpen: boolean;
  isTemplateDrawerOpen: boolean;
  openBugReportModal: () => void;
  openChangelogModal: () => void;
  openCreateCharacterModal: () => void;
  openGuideModal: () => void;
  openPlayerSettingsModal: () => void;
  resetExpandedMessages: () => void;
  setExpandedMessages: (
    next: ExpandedMessages | ((prev: ExpandedMessages) => ExpandedMessages)
  ) => void;
  toggleCharacterDrawer: () => void;
  toggleMessageExpansion: (entryId: string) => void;
  togglePlayerMenu: () => void;
  toggleTemplateDrawer: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  closeBugReportModal: () => set({ isBugReportModalOpen: false }),
  closeChangelogModal: () => set({ isChangelogModalOpen: false }),
  closeCharacterDrawer: () => set({ isCharacterDrawerOpen: false }),
  closeCreateCharacterModal: () => set({ isCreateCharacterModalOpen: false }),
  closeGuideModal: () => set({ isGuideModalOpen: false }),
  closePlayerMenu: () => set({ isPlayerMenuOpen: false }),
  closePlayerSettingsModal: () => set({ isPlayerSettingsModalOpen: false }),
  closeTemplateDrawer: () => set({ isTemplateDrawerOpen: false }),
  expandedMessages: {},
  isBugReportModalOpen: false,
  isChangelogModalOpen: false,
  isCharacterDrawerOpen: false,
  isCreateCharacterModalOpen: false,
  isGuideModalOpen: false,
  isPlayerMenuOpen: false,
  isPlayerSettingsModalOpen: false,
  isTemplateDrawerOpen: false,
  openBugReportModal: () => set({ isBugReportModalOpen: true }),
  openChangelogModal: () => set({ isChangelogModalOpen: true }),
  openCreateCharacterModal: () => set({ isCreateCharacterModalOpen: true }),
  openGuideModal: () => set({ isGuideModalOpen: true }),
  openPlayerSettingsModal: () => set({ isPlayerSettingsModalOpen: true }),
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
}));
