import type { Character, Skill, SkillCheckResult } from '@glass-frontier/dto';
import { skillKey, SKILL_TIER_SEQUENCE } from '@glass-frontier/dto';
import { log } from '@glass-frontier/utils';

import type { GraphContext } from '../types';

const XP_PER_LEVEL = 5;

const addOutcomeExperience = (
  skill: Skill,
  outcome: SkillCheckResult['outcomeTier']
): void => {
  if (outcome === 'collapse') {
    skill.xp += 2;
  } else if (outcome === 'regress') {
    skill.xp += 1;
  }
};

export function createUpdatedCharacter(context: GraphContext): Character {
  const result = context.skillCheckResult;
  const plan = context.skillCheckPlan;
  if (result === undefined || plan === undefined) {
    return context.chronicleState.character;
  }

  const working = structuredClone(context.chronicleState.character);

  working.momentum.current = result.newMomentum ?? working.momentum.current;
  const normalizedSkill = skillKey(plan.skill);
  log('info', `Updating for skill ${normalizedSkill}`);
  const skills = new Map(
    Object.entries(working.skills).map(([name, entry]) => [skillKey(name), entry])
  );
  let skill = skills.get(normalizedSkill);
  if (skill === undefined) {
    log('info', `Adding skill ${normalizedSkill}`);
    skill = {
      attribute: plan.attribute,
      name: plan.skill,
      tier: 'fool',
      xp: 0,
    };
  }
  addOutcomeExperience(skill, result.outcomeTier);
  if (skill.xp > XP_PER_LEVEL) {
    log('info', `Level up skill ${normalizedSkill}`);
    skill.xp -= XP_PER_LEVEL;
    const currentIndex = SKILL_TIER_SEQUENCE.indexOf(skill.tier);
    const newIndex = currentIndex === SKILL_TIER_SEQUENCE.length - 1
      ? currentIndex
      : currentIndex + 1;
    const nextTier = SKILL_TIER_SEQUENCE.at(newIndex);
    if (nextTier === undefined) {
      throw new Error(`Invalid skill tier index ${newIndex}.`);
    }
    skill.tier = nextTier;
  }
  skills.set(normalizedSkill, skill);
  working.skills = Object.fromEntries(skills);

  return working;
}
