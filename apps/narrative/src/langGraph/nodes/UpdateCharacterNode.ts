import { MOMENTUM_DELTA, type Attribute } from "@glass-frontier/dto";
import type { WorldStateStore } from "@glass-frontier/persistence";
import type { GraphContext } from "../../types.js";
import type { GraphNode } from "../orchestrator.js";

const XP_REWARDS: Record<string, number> = {
  collapse: 2,
  regress: 1
};

class UpdateCharacterNode implements GraphNode {
  readonly id = "character-update";

  constructor(private readonly worldStateStore: WorldStateStore) {}

  async execute(context: GraphContext): Promise<GraphContext> {
    if (context.failure) {
      return context;
    }

    const characterId = context.chronicle.character?.id;
    const intent = context.playerIntent;
    const checkResult = context.skillCheckResult;

    if (!characterId || !intent) {
      return context;
    }

    const skillName = intent.skill;
    const skillAttribute: Attribute | undefined = intent.attribute;
    const outcomeTier = checkResult?.outcomeTier;
    const momentumDelta = outcomeTier ? MOMENTUM_DELTA[outcomeTier] ?? 0 : 0;
    const xpAward = outcomeTier ? XP_REWARDS[outcomeTier] ?? 0 : 0;

    const skillMissing = Boolean(skillName && !context.chronicle.character?.skills?.[skillName]);
    const needsSkillXp = xpAward > 0;
    const wantsMomentumUpdate = momentumDelta !== 0;
    const shouldTouchSkill = skillName && skillAttribute && (skillMissing || needsSkillXp);

    if (!shouldTouchSkill && !wantsMomentumUpdate) {
      return context;
    }

    const updatedCharacter = await this.worldStateStore.applyCharacterProgress({
      characterId,
      momentumDelta: wantsMomentumUpdate ? momentumDelta : undefined,
      skill: shouldTouchSkill
        ? {
            name: skillName!,
            attribute: skillAttribute,
            xpAward
          }
        : undefined
    });

    if (!updatedCharacter) {
      return context;
    }

    return {
      ...context,
      chronicle: {
        ...context.chronicle,
        character: updatedCharacter
      },
      updatedCharacter
    };
  }
}

export { UpdateCharacterNode };
