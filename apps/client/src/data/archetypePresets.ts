import type { CharacterAttributes, CharacterSkillDraft } from '@glass-frontier/dto';
import { createDefaultCreationAttributes } from '@glass-frontier/dto';

/**
 * Starting builds. A preset fills in the mechanical half of the sheet — two
 * `advanced` attributes and the three declared skills — so creation starts from
 * something coherent the player edits, rather than a blank grid. The narrative
 * half is never prefilled: that is the part only the player can write.
 */
export type ArchetypePreset = {
  id: string;
  archetype: string;
  summary: string;
  advanced: Array<keyof CharacterAttributes>;
  skills: CharacterSkillDraft[];
};

export const ARCHETYPE_PRESETS: ArchetypePreset[] = [
  {
    advanced: ['focus', 'attunement'],
    archetype: 'Fault-Singer',
    id: 'fault-singer',
    skills: [
      { attribute: 'focus', name: 'read fault bands', tier: 'artisan' },
      { attribute: 'resolve', name: 'steady a shaking span', tier: 'apprentice' },
      { attribute: 'presence', name: 'call a stand-down', tier: 'apprentice' },
    ],
    summary: 'Hears where the glass is about to give, and says so before it does.',
  },
  {
    advanced: ['vitality', 'finesse'],
    archetype: 'Line Breaker',
    id: 'line-breaker',
    skills: [
      { attribute: 'vitality', name: 'break sealed doors', tier: 'artisan' },
      { attribute: 'finesse', name: 'cut fouled lines', tier: 'apprentice' },
      { attribute: 'vitality', name: 'take a hit standing', tier: 'apprentice' },
    ],
    summary: 'Gets through the thing everyone else is still arguing about.',
  },
  {
    advanced: ['finesse', 'focus'],
    archetype: 'Ghost Pilot',
    id: 'ghost-pilot',
    skills: [
      { attribute: 'finesse', name: 'fly bad approaches', tier: 'artisan' },
      { attribute: 'attunement', name: 'read weather off glass', tier: 'apprentice' },
      { attribute: 'presence', name: 'talk a tower down', tier: 'apprentice' },
    ],
    summary: 'Takes the approach nobody logs, and lands it more often than not.',
  },
  {
    advanced: ['presence', 'ingenuity'],
    archetype: 'Chain-Name Herald',
    id: 'chain-name-herald',
    skills: [
      { attribute: 'presence', name: 'talk down crowds', tier: 'artisan' },
      { attribute: 'ingenuity', name: 'trade in old debts', tier: 'apprentice' },
      { attribute: 'focus', name: 'read a room for loyalties', tier: 'apprentice' },
    ],
    summary: 'Carries names, favours and grudges between people who will not meet.',
  },
  {
    advanced: ['resolve', 'finesse'],
    archetype: 'Threshold Medic',
    id: 'threshold-medic',
    skills: [
      { attribute: 'finesse', name: 'bind wounds under fire', tier: 'artisan' },
      { attribute: 'resolve', name: 'hold someone together', tier: 'apprentice' },
      { attribute: 'ingenuity', name: 'scavenge field supply', tier: 'apprentice' },
    ],
    summary: 'Works in the doorway between a survivable wound and a fatal one.',
  },
  {
    advanced: ['ingenuity', 'attunement'],
    archetype: 'Glasswright',
    id: 'glasswright',
    skills: [
      { attribute: 'ingenuity', name: 'shape ringglass', tier: 'artisan' },
      { attribute: 'attunement', name: 'tune dead resonators', tier: 'apprentice' },
      { attribute: 'ingenuity', name: 'improvise from wreckage', tier: 'apprentice' },
    ],
    summary: 'Makes resonance hold a shape long enough to be useful.',
  },
];

export const applyPresetAttributes = (preset: ArchetypePreset): CharacterAttributes => {
  const attributes = createDefaultCreationAttributes();
  for (const name of preset.advanced) {
    attributes[name] = 'advanced';
  }
  return attributes;
};
