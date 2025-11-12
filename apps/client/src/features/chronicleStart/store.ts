import { create } from 'zustand';
import type { ChronicleSeed, LocationBreadcrumbEntry } from '@glass-frontier/dto';

export type ChronicleWizardStep = 'location' | 'tone' | 'seeds' | 'create';

export interface SelectedLocationSummary {
  id: string;
  name: string;
  breadcrumb: LocationBreadcrumbEntry[];
}

export interface ChronicleStartState {
  step: ChronicleWizardStep;
  selectedLocation: SelectedLocationSummary | null;
  toneChips: string[];
  toneNotes: string;
  seeds: ChronicleSeed[];
  chosenSeedId: string | null;
  customSeedText: string;
  customSeedTitle: string;
  listViewFallback: boolean;
}

interface ChronicleStartActions {
  reset(): void;
  setStep(step: ChronicleWizardStep): void;
  setSelectedLocation(selection: SelectedLocationSummary | null): void;
  toggleToneChip(chip: string): void;
  setToneNotes(notes: string): void;
  setSeeds(seeds: ChronicleSeed[]): void;
  chooseSeed(seedId: string | null): void;
  setCustomSeed(details: { title: string; text: string }): void;
  setListViewFallback(enabled: boolean): void;
}

const initialState: ChronicleStartState = {
  step: 'location',
  selectedLocation: null,
  toneChips: [],
  toneNotes: '',
  seeds: [],
  chosenSeedId: null,
  customSeedText: '',
  customSeedTitle: '',
  listViewFallback: false,
};

export const useChronicleStartStore = create<ChronicleStartState & ChronicleStartActions>((set) => ({
  ...initialState,
  reset: () => set(initialState),
  setStep: (step) => set((state) => ({ ...state, step })),
  setSelectedLocation: (selection) =>
    set((state) => ({
      ...state,
      selectedLocation: selection,
      step: selection ? state.step : 'location',
    })),
  toggleToneChip: (chip) =>
    set((state) => {
      const exists = state.toneChips.includes(chip);
      return {
        ...state,
        toneChips: exists
          ? state.toneChips.filter((value) => value !== chip)
          : [...state.toneChips, chip].slice(0, 8),
      };
    }),
  setToneNotes: (toneNotes) => set((state) => ({ ...state, toneNotes })),
  setSeeds: (seeds) =>
    set((state) => ({
      ...state,
      seeds,
      chosenSeedId: seeds.length ? seeds[0].id : null,
      customSeedText: '',
      customSeedTitle: '',
    })),
  chooseSeed: (seedId) =>
    set((state) => ({
      ...state,
      chosenSeedId: seedId,
      customSeedText: seedId ? state.customSeedText : '',
      customSeedTitle: seedId ? state.customSeedTitle : '',
    })),
  setCustomSeed: ({ title, text }) =>
    set((state) => ({
      ...state,
      customSeedTitle: title,
      customSeedText: text,
      chosenSeedId: null,
    })),
  setListViewFallback: (enabled) => set((state) => ({ ...state, listViewFallback: enabled })),
}));
