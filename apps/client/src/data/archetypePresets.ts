import type { CharacterAttributes, CharacterSkillDraft } from '@glass-frontier/dto';
import { createDefaultCreationAttributes } from '@glass-frontier/dto';

/**
 * Starting builds. A preset sets the two `advanced` attributes and the three
 * declared skills, giving the player a working sheet to edit in the aptitude
 * and skill steps. Presets leave every Nature field blank for the player.
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
    summary: 'Reads stress and resonance in ringglass. Hazard checks, structural timing, crew warnings.',
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
    summary: 'Forces entry and clears obstructions. Doors, restraints, fouled rigging, taking a hit.',
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
    summary: 'Flies and docks in bad conditions. Approaches, weather reads, talking to traffic control.',
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
    summary: 'Carries messages, debts and introductions between factions. Crowds, bargaining, reading a room.',
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
    summary: 'Treats injuries in the field. Wounds under fire, keeping someone conscious, improvised supply.',
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
    summary: 'Shapes and tunes ringglass. Repairs, resonators, building something out of wreckage.',
  },
];

export const applyPresetAttributes = (preset: ArchetypePreset): CharacterAttributes => {
  const attributes = createDefaultCreationAttributes();
  for (const name of preset.advanced) {
    attributes[name] = 'advanced';
  }
  return attributes;
};
