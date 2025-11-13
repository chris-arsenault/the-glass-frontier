import { MOMENTUM_DELTA, type Attribute, type OutcomeTier } from '@glass-frontier/dto';
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
    if (context.failure === true) {
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
    if (progress === null) {
      return context;
    }
    const updatedCharacter = await this.worldStateStore.applyCharacterProgress(progress);
    if (updatedCharacter === null || updatedCharacter === undefined) {
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
    if (!isNonEmptyString(characterId) || intent === undefined || intent.requiresCheck !== true) {
      return null;
    }
    const { momentumDelta, xpAward } = this.#calculateProgressDeltas(context);
    const skillUpdate = this.#buildSkillUpdate(context, intent, xpAward);
    if (skillUpdate === undefined && momentumDelta === 0) {
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
    if (outcomeTier === undefined) {
      return { momentumDelta: 0, xpAward: 0 };
    }
    return {
      momentumDelta: this.#momentumDeltaFor(outcomeTier),
      xpAward: this.#xpAwardFor(outcomeTier),
    };
  }

  #buildSkillUpdate(
    context: GraphContext,
    intent: NonNullable<GraphContext['playerIntent']>,
    xpAward: number
  ): { attribute: Attribute; name: string; xpAward: number } | undefined {
    const skillName = intent.skill;
    if (
      !isNonEmptyString(skillName) ||
      intent.attribute === undefined ||
      intent.attribute === null
    ) {
      return undefined;
    }
    const currentSkill = this.#getCharacterSkill(context, skillName);
    const needsUnlock = currentSkill === null;
    if (!needsUnlock && xpAward === 0) {
      return undefined;
    }
    return {
      attribute: intent.attribute,
      name: skillName,
      xpAward,
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

  #getCharacterSkill(context: GraphContext, skillName: string): unknown | null {
    const skills = context.chronicle.character?.skills;
    if (skills === undefined || skills === null) {
      return null;
    }
    for (const [name, entry] of Object.entries(skills)) {
      if (name === skillName) {
        return entry ?? null;
      }
    }
    return null;
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

  #xpAwardFor(outcome: OutcomeTier): number {
    switch (outcome) {
    case 'collapse':
      return XP_REWARDS.collapse;
    case 'regress':
      return XP_REWARDS.regress;
    default:
      return 0;
    }
  }
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export { UpdateCharacterNode };
