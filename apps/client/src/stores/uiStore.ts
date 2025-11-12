import { create } from 'zustand';

type ExpandedMessages = Record<string, boolean>;

type UiState = {
  isCharacterDrawerOpen: boolean;
  toggleCharacterDrawer: () => void;
  closeCharacterDrawer: () => void;
  isTemplateDrawerOpen: boolean;
  toggleTemplateDrawer: () => void;
  closeTemplateDrawer: () => void;
  isCreateCharacterModalOpen: boolean;
  openCreateCharacterModal: () => void;
  closeCreateCharacterModal: () => void;
  expandedMessages: ExpandedMessages;
  setExpandedMessages: (
    next: ExpandedMessages | ((prev: ExpandedMessages) => ExpandedMessages)
  ) => void;
  toggleMessageExpansion: (entryId: string) => void;
  resetExpandedMessages: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  closeCharacterDrawer: () => set({ isCharacterDrawerOpen: false }),
  closeCreateCharacterModal: () => set({ isCreateCharacterModalOpen: false }),
  closeTemplateDrawer: () => set({ isTemplateDrawerOpen: false }),
  expandedMessages: {},
  isCharacterDrawerOpen: false,
  isCreateCharacterModalOpen: false,
  isTemplateDrawerOpen: false,
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
  toggleTemplateDrawer: () =>
    set((state) => ({
      isTemplateDrawerOpen: !state.isTemplateDrawerOpen,
    })),
}));
