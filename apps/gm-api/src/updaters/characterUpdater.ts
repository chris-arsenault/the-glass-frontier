import {GraphContext} from "../types";
import {Character, Skill, SKILL_TIER_SEQUENCE} from "@glass-frontier/dto";

const XP_PER_LEVEL = 5;

export function createUpdatedCharacter(context: GraphContext): Character {
  if (!context.skillCheckResult || !context.skillCheckPlan?.skill) {
    return context.chronicleState.character;
  }

  const working = structuredClone(context.chronicleState.character);

  //update momentum
  working.momentum.current = context.skillCheckResult.newMomentum ?? working.momentum.current;

  // add skills
  const existing = context.skillCheckPlan.skill in working.skills;
  if (!existing) {
    working.skills[context.skillCheckPlan.skill] = {
      attribute: context.skillCheckPlan.attribute,
      name: context.skillCheckPlan.skill,
      tier: "fool",
      xp: 0
    } as Skill;
  }
  // add skill xp
  switch (context.skillCheckResult.outcomeTier) {
    case "collapse":
      working.skills[context.skillCheckPlan.skill].xp += 2
      break;
    case "regress":
      working.skills[context.skillCheckPlan.skill].xp += 1
      break;
    default:
      break;
  }

  if (working.skills[context.skillCheckPlan.skill].xp > XP_PER_LEVEL) {
    working.skills[context.skillCheckPlan.skill].xp -= XP_PER_LEVEL;
    const currentIndex = SKILL_TIER_SEQUENCE[working.skills[context.skillCheckPlan.skill].tier];
    const newIndex = currentIndex == SKILL_TIER_SEQUENCE.length - 1 ?  currentIndex : currentIndex+ 1;
    working.skills[context.skillCheckPlan.skill].tier = SKILL_TIER_SEQUENCE[newIndex];
  }

  return working;
}