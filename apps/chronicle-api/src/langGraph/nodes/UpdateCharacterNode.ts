import type { WorldStateStoreV2, Character, OutcomeTier } from '@glass-frontier/worldstate';

import type { GraphContext } from '../../types.js';
import type { GraphNode } from '../orchestrator.js';

class UpdateCharacterNode implements GraphNode {
  readonly id = 'character-update';

  constructor(private readonly worldStateStore: WorldStateStoreV2) {}

  async execute(context: GraphContext): Promise<GraphContext> {
    if (context.failure === true) {
      return context;
    }

    const inventoryContext = await this.#applyInventoryDelta(context);
    if (inventoryContext.failure) {
      return inventoryContext;
    }

    return this.#applyMomentumUpdate(inventoryContext);
  }

  async #applyInventoryDelta(context: GraphContext): Promise<GraphContext> {
    const preview = context.inventoryPreview;
    const character = context.chronicle.character;
    const hasDelta = context.inventoryDelta?.ops?.length ?? 0;
    if (
      character === undefined ||
      character === null ||
      preview === undefined ||
      preview === null ||
      hasDelta === 0
    ) {
      return context;
    }
    try {
      const updatedCharacter = await this.worldStateStore.updateCharacter({
        ...character,
        inventory: preview,
      });
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

const MOMENTUM_DELTA: Record<OutcomeTier, number> = {
  breakthrough: 2,
  advance: 1,
  stall: 0,
  regress: -1,
  collapse: -2,
};

export { UpdateCharacterNode };
