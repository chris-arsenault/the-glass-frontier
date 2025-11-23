import type { ChronicleSeed } from '@glass-frontier/dto';
import { create } from 'zustand';

export type ChronicleWizardStep = 'location' | 'tone' | 'seeds' | 'anchor' | 'create';

export type SelectedLocationEntity = {
  id: string;
  slug: string;
  name: string;
  description?: string;
  status?: string;
  subkind?: string;
}

export type SelectedAnchorEntity = {
  id: string;
  slug: string;
  name: string;
  kind: string;
  description?: string;
  subkind?: string;
}

export type ChronicleStartState = {
  step: ChronicleWizardStep;
  selectedLocation: SelectedLocationEntity | null;
  selectedAnchorEntity: SelectedAnchorEntity | null;
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
  setSelectedLocation: (selection: SelectedLocationEntity | null) => void;
  setSelectedAnchorEntity: (selection: SelectedAnchorEntity | null) => void;
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
  selectedAnchorEntity: null,
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
  setSelectedAnchorEntity: (selection) => set({ selectedAnchorEntity: selection }),
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
