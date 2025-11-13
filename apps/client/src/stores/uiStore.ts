import { create } from 'zustand';

type ExpandedMessages = Record<string, boolean>;

type UiState = {
  isCharacterDrawerOpen: boolean;
  toggleCharacterDrawer: () => void;
  closeCharacterDrawer: () => void;
  isTemplateDrawerOpen: boolean;
  toggleTemplateDrawer: () => void;
  closeTemplateDrawer: () => void;
  isChangelogModalOpen: boolean;
  openChangelogModal: () => void;
  closeChangelogModal: () => void;
  isCreateCharacterModalOpen: boolean;
  openCreateCharacterModal: () => void;
  closeCreateCharacterModal: () => void;
  expandedMessages: ExpandedMessages;
  setExpandedMessages: (
    next: ExpandedMessages | ((prev: ExpandedMessages) => ExpandedMessages)
  ) => void;
  toggleMessageExpansion: (entryId: string) => void;
  resetExpandedMessages: () => void;
  isPlayerMenuOpen: boolean;
  togglePlayerMenu: () => void;
  closePlayerMenu: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  closeChangelogModal: () => set({ isChangelogModalOpen: false }),
  closeCharacterDrawer: () => set({ isCharacterDrawerOpen: false }),
  closeCreateCharacterModal: () => set({ isCreateCharacterModalOpen: false }),
  closePlayerMenu: () => set({ isPlayerMenuOpen: false }),
  closeTemplateDrawer: () => set({ isTemplateDrawerOpen: false }),
  expandedMessages: {},
  isChangelogModalOpen: false,
  isCharacterDrawerOpen: false,
  isCreateCharacterModalOpen: false,
  isPlayerMenuOpen: false,
  isTemplateDrawerOpen: false,
  openChangelogModal: () => set({ isChangelogModalOpen: true }),
  openCreateCharacterModal: () => set({ isCreateCharacterModalOpen: true }),
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
