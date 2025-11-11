import { MOMENTUM_DELTA, type Attribute } from '@glass-frontier/dto';
import type { WorldStateStore, LocationGraphStore } from '@glass-frontier/persistence';
import type { GraphContext } from '../../types.js';
import type { GraphNode } from '../orchestrator.js';
import { log } from '@glass-frontier/utils';

const XP_REWARDS: Record<string, number> = {
  collapse: 2,
  regress: 1,
};

class UpdateCharacterNode implements GraphNode {
  readonly id = 'character-update';

  constructor(
    private readonly worldStateStore: WorldStateStore,
    private readonly locationGraphStore?: LocationGraphStore
  ) {}

  async execute(context: GraphContext): Promise<GraphContext> {
    if (context.failure) {
      return context;
    }

    const characterUpdateContext = await this.#applySkillUpdates(context);
    const locationUpdateContext = await this.#applyLocationPlan(characterUpdateContext);

    return locationUpdateContext;
  }

  async #applySkillUpdates(context: GraphContext): Promise<GraphContext> {

    const characterId = context.chronicle.character?.id;
    const intent = context.playerIntent;
    const checkResult = context.skillCheckResult;

    if (!characterId || !intent || !intent.requiresCheck) {
      return context;
    }

    const skillName = intent.skill;
    const skillAttribute: Attribute | undefined = intent.attribute;
    const outcomeTier = checkResult?.outcomeTier;
    const momentumDelta = outcomeTier ? (MOMENTUM_DELTA[outcomeTier] ?? 0) : 0;
    const xpAward = outcomeTier ? (XP_REWARDS[outcomeTier] ?? 0) : 0;

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
            xpAward,
          }
        : undefined,
    });

    let nextContext: GraphContext = context;

    if (updatedCharacter) {
      nextContext = {
        ...nextContext,
        chronicle: {
          ...nextContext.chronicle,
          character: updatedCharacter,
        },
        updatedCharacter,
      };

    }
      return nextContext;
  }

  async #applyLocationPlan(context: GraphContext): Promise<GraphContext> {
    if (!this.locationGraphStore || !context.locationPlan || !context.chronicle.character?.id) {
      return context;
    }
    try {
      const locationId = context.chronicle.chronicle.locationId;
      if (!locationId) {
        return context;
      }
      await this.locationGraphStore.applyPlan({
        locationId,
        characterId: context.chronicle.character.id,
        plan: context.locationPlan,
      });
      const summary = await this.locationGraphStore.summarizeCharacterLocation({
        locationId,
        characterId: context.chronicle.character.id,
      });
      return {
        ...context,
        locationSummary: summary ?? context.locationSummary ?? null,
      };
    } catch (error) {
      log('warn', 'location-plan.apply.failed', {
        chronicleId: context.chronicleId,
        locationId: context.chronicle.chronicle.locationId,
        reason: error instanceof Error ? error.message : 'unknown',
      });
      return context;
    }
  }
}

export { UpdateCharacterNode };
