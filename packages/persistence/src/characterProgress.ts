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

const nextTier = (current: SkillTier): SkillTier => {
  const order = SKILL_TIER_SEQUENCE as ReadonlyArray<SkillTier>;
  const index = order.indexOf(current);
  if (index < 0 || index === order.length - 1) {
    return current;
  }
  return order[index + 1];
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

const ensureSkillRecord = (
  skillMap: Record<string, Skill>,
  name: string,
  attribute: Attribute
): Skill => {
  const existing = skillMap[name];
  if (existing) {
    return existing;
  }
  const created: Skill = {
    name,
    attribute,
    tier: 'fool',
    xp: 0,
  };
  skillMap[name] = created;
  return created;
};

export const applyCharacterSnapshotProgress = (
  character: Character,
  update: CharacterProgressPayload
): Character => {
  const next: Character = {
    ...character,
    momentum: { ...character.momentum },
    skills: { ...character.skills },
  };

  if (typeof update.momentumDelta === 'number' && update.momentumDelta !== 0) {
    next.momentum.current = clampMomentum(next.momentum, update.momentumDelta);
  }

  if (update.skill?.name && update.skill.attribute) {
    const name = update.skill.name;
    const baseline = ensureSkillRecord(next.skills, name, update.skill.attribute);
    const xpAward = update.skill.xpAward ?? 0;
    const normalizedBaseline =
      baseline.attribute === update.skill.attribute
        ? baseline
        : { ...baseline, attribute: update.skill.attribute };
    const normalized = normalizeSkill(normalizedBaseline, xpAward);
    next.skills[name] = normalized;
  }

  return next;
};
