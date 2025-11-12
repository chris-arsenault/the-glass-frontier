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
    const progress = this.#evaluateSkillProgress(context);
    if (!progress) {
      return context;
    }
    const updatedCharacter = await this.worldStateStore.applyCharacterProgress(progress);
    if (!updatedCharacter) {
      return context;
    }
    return {
      ...context,
      chronicle: {
        ...context.chronicle,
        character: updatedCharacter,
      },
      updatedCharacter,
    };
  }

  #evaluateSkillProgress(
    context: GraphContext
  ): { characterId: string; momentumDelta?: number; skill?: { attribute: Attribute; name: string; xpAward: number } } | null {
    const characterId = context.chronicle.character?.id;
    const intent = context.playerIntent;
    if (!characterId || !intent || !intent.requiresCheck) {
      return null;
    }
    const { momentumDelta, xpAward } = this.#calculateProgressDeltas(context);
    const skillUpdate = this.#buildSkillUpdate(context, intent, xpAward);
    if (!skillUpdate && momentumDelta === 0) {
      return null;
    }
    return {
      characterId,
      momentumDelta: momentumDelta !== 0 ? momentumDelta : undefined,
      skill: skillUpdate,
    };
  }

  #calculateProgressDeltas(context: GraphContext): { momentumDelta: number; xpAward: number } {
    const outcomeTier = context.skillCheckResult?.outcomeTier;
    if (!outcomeTier) {
      return { momentumDelta: 0, xpAward: 0 };
    }
    return {
      momentumDelta: MOMENTUM_DELTA[outcomeTier] ?? 0,
      xpAward: XP_REWARDS[outcomeTier] ?? 0,
    };
  }

  #buildSkillUpdate(
    context: GraphContext,
    intent: NonNullable<GraphContext['playerIntent']>,
    xpAward: number
  ): { attribute: Attribute; name: string; xpAward: number } | undefined {
    if (!intent.skill || !intent.attribute) {
      return undefined;
    }
    const currentSkill = context.chronicle.character?.skills?.[intent.skill];
    const needsUnlock = !currentSkill;
    if (!needsUnlock && xpAward === 0) {
      return undefined;
    }
    return {
      attribute: intent.attribute,
      name: intent.skill,
      xpAward,
    };
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
