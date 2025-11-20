import {GraphContext} from "../types";
import {Character, Skill, SKILL_TIER_SEQUENCE} from "@glass-frontier/dto";
import {log, toSnakeCase} from "@glass-frontier/utils";

const XP_PER_LEVEL = 5;

export function createUpdatedCharacter(context: GraphContext): Character {
  if (!context.skillCheckResult || !context.skillCheckPlan?.skill) {
    return context.chronicleState.character;
  }

  const working = structuredClone(context.chronicleState.character);

  //update momentum
  working.momentum.current = context.skillCheckResult.newMomentum ?? working.momentum.current;

  // add skills
  const normalizedSkill = toSnakeCase(context.skillCheckPlan.skill);
  log("info", `Updating for skill ${normalizedSkill}`);
  const existing = normalizedSkill in working.skills;
  if (!existing) {
    log("info", `Adding skill ${normalizedSkill}`);
    working.skills[normalizedSkill] = {
      attribute: context.skillCheckPlan.attribute,
      name: context.skillCheckPlan.skill,
      tier: "fool",
      xp: 0
    } as Skill;
  }
  // add skill xp
  switch (context.skillCheckResult.outcomeTier) {
    case "collapse":
      working.skills[normalizedSkill].xp += 2
      break;
    case "regress":
      working.skills[normalizedSkill].xp += 1
      break;
    default:
      break;
  }

  if (working.skills[normalizedSkill].xp > XP_PER_LEVEL) {
    log("info", `Level up skill ${normalizedSkill}`);
    working.skills[normalizedSkill].xp -= XP_PER_LEVEL;
    const currentIndex = SKILL_TIER_SEQUENCE[working.skills[normalizedSkill].tier];
    const newIndex = currentIndex == SKILL_TIER_SEQUENCE.length - 1 ?  currentIndex : currentIndex+ 1;
    working.skills[normalizedSkill].tier = SKILL_TIER_SEQUENCE[newIndex];
  }

  return working;
}