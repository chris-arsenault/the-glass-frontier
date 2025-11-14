import type { ChronicleSeed, LocationBreadcrumbEntry } from '@glass-frontier/dto';
import { create } from 'zustand';

export type ChronicleWizardStep = 'location' | 'tone' | 'seeds' | 'create';

export type SelectedLocationSummary = {
  id: string;
  name: string;
  breadcrumb: LocationBreadcrumbEntry[];
}

export type ChronicleStartState = {
  step: ChronicleWizardStep;
  selectedLocation: SelectedLocationSummary | null;
  toneChips: string[];
  toneNotes: string;
  seeds: ChronicleSeed[];
  chosenSeedId: string | null;
  customSeedText: string;
  customSeedTitle: string;
  listViewFallback: boolean;
  beatsEnabled: boolean;
}

type ChronicleStartActions = {
  reset: () => void;
  setStep: (step: ChronicleWizardStep) => void;
  setSelectedLocation: (selection: SelectedLocationSummary | null) => void;
  toggleToneChip: (chip: string) => void;
  setToneNotes: (notes: string) => void;
  setSeeds: (seeds: ChronicleSeed[]) => void;
  chooseSeed: (seedId: string | null) => void;
  setCustomSeed: (details: { title: string; text: string }) => void;
  setListViewFallback: (enabled: boolean) => void;
  setBeatsEnabled: (enabled: boolean) => void;
}

const initialState: ChronicleStartState = {
  beatsEnabled: true,
  chosenSeedId: null,
  customSeedText: '',
  customSeedTitle: '',
  listViewFallback: false,
  seeds: [],
  selectedLocation: null,
  step: 'location',
  toneChips: [],
  toneNotes: '',
};

export const useChronicleStartStore = create<ChronicleStartState & ChronicleStartActions>((set) => ({
  ...initialState,
  chooseSeed: (seedId) =>
    set((state) => ({
      chosenSeedId: seedId,
      customSeedText: seedId ? state.customSeedText : '',
      customSeedTitle: seedId ? state.customSeedTitle : '',
    })),
  reset: () => set(initialState),
  setBeatsEnabled: (enabled) => set({ beatsEnabled: enabled }),
  setCustomSeed: ({ text, title }) =>
    set({
      chosenSeedId: null,
      customSeedText: text,
      customSeedTitle: title,
    }),
  setListViewFallback: (enabled) => set({ listViewFallback: enabled }),
  setSeeds: (seeds) =>
    set({
      chosenSeedId: seeds.length ? seeds[0].id : null,
      customSeedText: '',
      customSeedTitle: '',
      seeds,
    }),
  setSelectedLocation: (selection) =>
    set((state) => ({
      selectedLocation: selection,
      step: selection ? state.step : 'location',
    })),
  setStep: (step) => set({ step }),
  setToneNotes: (toneNotes) => set({ toneNotes }),
  toggleToneChip: (chip) =>
    set((state) => {
      const exists = state.toneChips.includes(chip);
      const next = exists
        ? state.toneChips.filter((value) => value !== chip)
        : [...state.toneChips, chip].slice(0, 8);
      return { toneChips: next };
    }),
}));
