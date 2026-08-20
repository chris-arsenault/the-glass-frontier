import { InventoryDeltaSchema, type IntentType } from '@glass-frontier/dto';
import { LlmClassifierNode } from '@glass-frontier/gm-api/gmGraph/nodes/classifiers/LlmClassiferNode';
import { isNonEmptyString } from '@glass-frontier/utils';
import type { z } from 'zod';

import type { GraphContext } from '../../../types.js';


export type InventoryDelta = z.infer<typeof InventoryDeltaSchema>;
const NODE_ID = 'inventory-delta';
const RUNNABLE_INTENTS = new Set<IntentType>(['action', 'planning', 'wrap']);

class InventoryDeltaNode extends LlmClassifierNode<InventoryDelta> {
  readonly id = NODE_ID;
  constructor() {
    super({
      applyResult: (context, result) => this.#saveInventoryDelta(context, result),
      id: NODE_ID,
      schema: InventoryDeltaSchema,
      schemaName: 'inventory_delta_response',
      shouldRun: (context) => this.#isRunnable(context),
      telemetryTag: NODE_ID
    });
  }

  #isRunnable(context: GraphContext): boolean {
    const intentType = context.playerIntent?.intentType;
    return (
      intentType !== undefined
      && RUNNABLE_INTENTS.has(intentType)
      && isNonEmptyString(context.gmResponse?.content)
      && isNonEmptyString(context.chronicleState.chronicle.characterId)
    );
  }

  #saveInventoryDelta(context: GraphContext, result: InventoryDelta): GraphContext {
    return {
      ...context,
      inventoryDelta: result,
    };
  }
}

export { InventoryDeltaNode };
