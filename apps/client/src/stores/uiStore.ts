import { create } from "zustand";

type UiState = {
  isCharacterDrawerOpen: boolean;
  toggleCharacterDrawer: () => void;
  closeCharacterDrawer: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  isCharacterDrawerOpen: false,
  toggleCharacterDrawer: () =>
    set((state) => ({
      isCharacterDrawerOpen: !state.isCharacterDrawerOpen
    })),
  closeCharacterDrawer: () => set({ isCharacterDrawerOpen: false })
}));
