import { MOMENTUM_DELTA, type Attribute } from '@glass-frontier/dto';
import {
  resolveInventoryDelta,
  type WorldStateStore,
  type LocationGraphStore,
} from '@glass-frontier/persistence';
import { log } from '@glass-frontier/utils';

import type { GraphContext } from '../../types.js';
import type { GraphNode } from '../orchestrator.js';

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

    const inventoryContext = await this.#applyInventoryDelta(context);
    if (inventoryContext.failure) {
      return inventoryContext;
    }

    const characterUpdateContext = await this.#applySkillUpdates(inventoryContext);
    const locationUpdateContext = await this.#applyLocationPlan(characterUpdateContext);

    return locationUpdateContext;
  }

  async #applyInventoryDelta(context: GraphContext): Promise<GraphContext> {
    const storeDelta = context.inventoryStoreDelta;
    const character = context.chronicle.character;
    if (!storeDelta || !character || storeDelta.ops.length === 0) {
      return context;
    }

    try {
      const nextInventory = resolveInventoryDelta(character.inventory, storeDelta, {
        registry: context.inventoryRegistry ?? null,
      });
      const updatedCharacter = {
        ...character,
        inventory: nextInventory,
      };
      await this.worldStateStore.upsertCharacter(updatedCharacter);
      return {
        ...context,
        chronicle: {
          ...context.chronicle,
          character: updatedCharacter,
        },
        updatedCharacter,
      };
    } catch (error) {
      context.telemetry?.recordToolError?.({
        attempt: 0,
        chronicleId: context.chronicleId,
        message: error instanceof Error ? error.message : 'unknown',
        operation: 'inventory-delta.commit',
      });
      return { ...context, failure: true };
    }
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
          attribute: skillAttribute,
          name: skillName,
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
        characterId: context.chronicle.character.id,
        locationId,
        plan: context.locationPlan,
      });
      const summary = await this.locationGraphStore.summarizeCharacterLocation({
        characterId: context.chronicle.character.id,
        locationId,
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
