import type { AllegianceStance, CharacterAttributes, CharacterSkillDraft } from '@glass-frontier/dto';
import { createDefaultCreationAttributes } from '@glass-frontier/dto';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type CharacterWizardStep =
  | 'origin'
  | 'concept'
  | 'aptitudes'
  | 'skills'
  | 'nature'
  | 'review';

export const CHARACTER_WIZARD_STEPS: CharacterWizardStep[] = [
  'origin',
  'concept',
  'aptitudes',
  'skills',
  'nature',
  'review',
];

/** The origin picks, held as ids until the draft is submitted. */
export type OriginDraft = {
  allegianceId: string;
  allegianceStance: AllegianceStance;
  cultureReferenceId: string;
  homelandId: string;
  speciesReferenceId: string;
};

export type CharacterCreationState = {
  step: CharacterWizardStep;
  archetype: string;
  attributes: CharacterAttributes;
  bio: string;
  callings: string[];
  drive: string;
  flaw: string;
  instinct: string;
  name: string;
  origin: OriginDraft;
  presetId: string | null;
  pronouns: string;
  skills: CharacterSkillDraft[];
  uniqueThing: string;
};

type CharacterCreationActions = {
  reset: () => void;
  setStep: (step: CharacterWizardStep) => void;
  update: (patch: Partial<CharacterCreationState>) => void;
  setAttribute: (name: keyof CharacterAttributes, tier: CharacterAttributes[keyof CharacterAttributes]) => void;
  setSkill: (index: number, patch: Partial<CharacterSkillDraft>) => void;
  setCalling: (index: number, value: string) => void;
};

/** Three declared skills: one artisan, two apprentice. */
const emptySkills = (): CharacterSkillDraft[] => [
  { attribute: 'focus', name: '', tier: 'artisan' },
  { attribute: 'focus', name: '', tier: 'apprentice' },
  { attribute: 'focus', name: '', tier: 'apprentice' },
];

const initialState = (): CharacterCreationState => ({
  archetype: '',
  attributes: createDefaultCreationAttributes(),
  bio: '',
  callings: ['', ''],
  drive: '',
  flaw: '',
  instinct: '',
  name: '',
  origin: {
    allegianceId: '',
    allegianceStance: 'member',
    cultureReferenceId: '',
    homelandId: '',
    speciesReferenceId: '',
  },
  presetId: null,
  pronouns: '',
  skills: emptySkills(),
  step: 'origin',
  uniqueThing: '',
});

/**
 * The Encyclopedia cutover changed both origin namespaces and every canon UUID.
 * A saved draft from before that cutover cannot retain a valid origin selection.
 */
export const migrateCharacterCreationState = (): CharacterCreationState => initialState();

export const useCharacterCreationStore = create<
  CharacterCreationState & CharacterCreationActions
>()(
  persist(
    (set) => ({
      ...initialState(),
      reset: () => set(initialState()),
      setAttribute: (name, tier) =>
        set((state) => ({ attributes: { ...state.attributes, [name]: tier } })),
      setCalling: (index, value) =>
        set((state) => ({
          callings: state.callings.map((calling, position) =>
            position === index ? value : calling
          ),
        })),
      setSkill: (index, patch) =>
        set((state) => ({
          skills: state.skills.map((skill, position) =>
            position === index ? { ...skill, ...patch } : skill
          ),
        })),
      setStep: (step) => set({ step }),
      update: (patch) => set(patch),
    }),
    {
      migrate: migrateCharacterCreationState,
      name: 'glass-frontier-character-creation',
      version: 1,
    }
  )
);
