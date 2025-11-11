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
  isCharacterDrawerOpen: false,
  toggleCharacterDrawer: () =>
    set((state) => ({
      isCharacterDrawerOpen: !state.isCharacterDrawerOpen,
    })),
  closeCharacterDrawer: () => set({ isCharacterDrawerOpen: false }),
  isTemplateDrawerOpen: false,
  toggleTemplateDrawer: () =>
    set((state) => ({
      isTemplateDrawerOpen: !state.isTemplateDrawerOpen,
    })),
  closeTemplateDrawer: () => set({ isTemplateDrawerOpen: false }),
  isCreateCharacterModalOpen: false,
  openCreateCharacterModal: () => set({ isCreateCharacterModalOpen: true }),
  closeCreateCharacterModal: () => set({ isCreateCharacterModalOpen: false }),
  expandedMessages: {},
  setExpandedMessages: (next) =>
    set((state) => ({
      expandedMessages:
        typeof next === 'function'
          ? (next as (prev: ExpandedMessages) => ExpandedMessages)(state.expandedMessages)
          : next,
    })),
  toggleMessageExpansion: (entryId) =>
    set((state) => ({
      expandedMessages: {
        ...state.expandedMessages,
        [entryId]: !(state.expandedMessages[entryId] ?? false),
      },
    })),
  resetExpandedMessages: () => set({ expandedMessages: {} }),
}));
