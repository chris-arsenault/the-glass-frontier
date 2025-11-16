import { MOMENTUM_DELTA, type OutcomeTier } from '@glass-frontier/dto';
import { resolveInventoryDelta, type LocationGraphStore } from '@glass-frontier/persistence';
import type { WorldStateStoreV2, Character } from '@glass-frontier/worldstate';
import { log } from '@glass-frontier/utils';

import type { GraphContext } from '../../types.js';
import type { GraphNode } from '../orchestrator.js';

class UpdateCharacterNode implements GraphNode {
  readonly id = 'character-update';

  constructor(
    private readonly worldStateStore: WorldStateStoreV2,
    private readonly locationGraphStore?: LocationGraphStore
  ) {}

  async execute(context: GraphContext): Promise<GraphContext> {
    if (context.failure === true) {
      return context;
    }

    const inventoryContext = await this.#applyInventoryDelta(context);
    if (inventoryContext.failure) {
      return inventoryContext;
    }

    const characterUpdateContext = await this.#applyMomentumUpdate(inventoryContext);
    const locationUpdateContext = await this.#applyLocationPlan(characterUpdateContext);

    return locationUpdateContext;
  }

  async #applyInventoryDelta(context: GraphContext): Promise<GraphContext> {
    const inputs = this.#extractInventoryInputs(context);
    if (inputs === null) {
      return context;
    }

    const { character, storeDelta } = inputs;
    try {
      const nextInventory = resolveInventoryDelta(character.inventory, storeDelta, {
        registry: context.inventoryRegistry ?? null,
      });
      const updatedCharacter = {
        ...character,
        inventory: nextInventory,
      };
      await this.worldStateStore.updateCharacter(updatedCharacter);
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

  async #applyMomentumUpdate(context: GraphContext): Promise<GraphContext> {
    if (context.playerIntent?.requiresCheck !== true) {
      return context;
    }
    const momentumDelta = this.#momentumDeltaFor(context.skillCheckResult?.outcomeTier);
    if (momentumDelta === 0) {
      return context;
    }
    const character = context.chronicle.character;
    if (character === null || character === undefined) {
      return context;
    }
    const updatedCharacter = await this.worldStateStore.updateCharacter({
      ...character,
      momentum: this.#applyMomentumDelta(character.momentum, momentumDelta),
    });
    return {
      ...context,
      chronicle: {
        ...context.chronicle,
        character: updatedCharacter,
      },
      updatedCharacter,
    };
  }

  async #applyLocationPlan(context: GraphContext): Promise<GraphContext> {
    if (this.locationGraphStore === undefined) {
      return context;
    }
    const planInputs = this.#extractLocationPlanInputs(context);
    if (planInputs === null) {
      return context;
    }
    const { characterId, locationId, plan } = planInputs;
    try {
      await this.locationGraphStore.applyPlan({
        characterId,
        locationId,
        plan,
      });
      const summary = await this.locationGraphStore.summarizeCharacterLocation({
        characterId,
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

  #extractInventoryInputs(
    context: GraphContext
  ): { character: NonNullable<typeof context.chronicle.character>; storeDelta: NonNullable<typeof context.inventoryStoreDelta> } | null {
    const storeDelta = context.inventoryStoreDelta;
    if (storeDelta === undefined || storeDelta === null || storeDelta.ops.length === 0) {
      return null;
    }
    const character = context.chronicle.character;
    if (character === undefined || character === null) {
      return null;
    }
    return { character, storeDelta };
  }

  #extractLocationPlanInputs(
    context: GraphContext
  ): { characterId: string; locationId: string; plan: NonNullable<GraphContext['locationPlan']> } | null {
    if (this.locationGraphStore === undefined) {
      return null;
    }
    const plan = context.locationPlan;
    const characterId = context.chronicle.character?.id;
    const locationId = context.chronicle.chronicle.locationId;
    if (
      plan === undefined ||
      plan === null ||
      plan.ops.length === 0 ||
      !isNonEmptyString(characterId) ||
      !isNonEmptyString(locationId)
    ) {
      return null;
    }
    return { characterId, locationId, plan };
  }

  #applyMomentumDelta(momentum: Character['momentum'], delta: number): Character['momentum'] {
    const target = Math.max(momentum.floor, Math.min(momentum.ceiling, momentum.current + delta));
    return {
      ...momentum,
      current: target,
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  #momentumDeltaFor(outcome: OutcomeTier): number {
    switch (outcome) {
    case 'breakthrough':
      return MOMENTUM_DELTA.breakthrough;
    case 'advance':
      return MOMENTUM_DELTA.advance;
    case 'stall':
      return MOMENTUM_DELTA.stall;
    case 'regress':
      return MOMENTUM_DELTA.regress;
    case 'collapse':
      return MOMENTUM_DELTA.collapse;
    default:
      return 0;
    }
  }

}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export { UpdateCharacterNode };
