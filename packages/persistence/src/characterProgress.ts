import {
  SKILL_TIER_SEQUENCE,
  type Attribute,
  type Character,
  type Skill,
  type SkillTier,
} from '@glass-frontier/dto';

import type { CharacterProgressPayload } from './types';

const clampMomentum = (state: Character['momentum'], delta: number): number => {
  const candidate = state.current + delta;
  if (candidate < state.floor) {
    return state.floor;
  }
  if (candidate > state.ceiling) {
    return state.ceiling;
  }
  return candidate;
};

const tierSequence: readonly SkillTier[] = SKILL_TIER_SEQUENCE;

const nextTier = (current: SkillTier): SkillTier => {
  const index = tierSequence.indexOf(current);
  if (index < 0 || index === tierSequence.length - 1) {
    return current;
  }
  return tierSequence[index + 1];
};

const normalizeSkill = (skill: Skill, xpAward: number): Skill => {
  if (xpAward <= 0) {
    return skill;
  }

  let xp = skill.xp + xpAward;
  let tier = skill.tier;

  while (xp >= 3) {
    const upgraded = nextTier(tier);
    if (upgraded === tier) {
      xp = 0;
      break;
    }
    tier = upgraded;
    xp -= 3;
  }

  return { ...skill, tier, xp };
};

const resolveBaselineSkill = (
  skills: Record<string, Skill>,
  name: string,
  attribute: Attribute
): Skill => {
  const match = Object.entries(skills).find(([skillName]) => skillName === name)?.[1];
  if (match !== undefined) {
    return match;
  }
  return {
    attribute,
    name,
    tier: 'fool',
    xp: 0,
  };
};

const applyMomentumDelta = (
  momentum: Character['momentum'],
  delta?: number
): Character['momentum'] => {
  const next = { ...momentum };
  if (typeof delta === 'number' && delta !== 0) {
    next.current = clampMomentum(momentum, delta);
  }
  return next;
};

const applySkillProgressUpdate = (
  skills: Record<string, Skill>,
  skillUpdate?: CharacterProgressPayload['skill']
): Record<string, Skill> => {
  const snapshot = { ...skills };
  if (skillUpdate === undefined) {
    return snapshot;
  }
  const trimmedSkillName = skillUpdate.name.trim();
  if (trimmedSkillName.length === 0) {
    return snapshot;
  }
  const attribute = skillUpdate.attribute;
  const baseline = resolveBaselineSkill(snapshot, trimmedSkillName, attribute);
  const normalizedBaseline =
    baseline.attribute === attribute ? baseline : { ...baseline, attribute };
  const normalized = normalizeSkill(normalizedBaseline, skillUpdate.xpAward ?? 0);
  return { ...snapshot, [trimmedSkillName]: normalized };
};

export const applyCharacterSnapshotProgress = (
  character: Character,
  update: CharacterProgressPayload
): Character => {
  return {
    ...character,
    momentum: applyMomentumDelta(character.momentum, update.momentumDelta),
    skills: applySkillProgressUpdate(character.skills, update.skill),
  };
};
