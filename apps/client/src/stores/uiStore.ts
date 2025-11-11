import { create } from "zustand";

type UiState = {
  isCharacterDrawerOpen: boolean;
  toggleCharacterDrawer: () => void;
  closeCharacterDrawer: () => void;
  isCreateCharacterModalOpen: boolean;
  openCreateCharacterModal: () => void;
  closeCreateCharacterModal: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  isCharacterDrawerOpen: false,
  toggleCharacterDrawer: () =>
    set((state) => ({
      isCharacterDrawerOpen: !state.isCharacterDrawerOpen
    })),
  closeCharacterDrawer: () => set({ isCharacterDrawerOpen: false }),
  isCreateCharacterModalOpen: false,
  openCreateCharacterModal: () => set({ isCreateCharacterModalOpen: true }),
  closeCreateCharacterModal: () => set({ isCreateCharacterModalOpen: false })
}));
