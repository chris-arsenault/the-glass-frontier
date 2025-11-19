import type { GraphContext } from '../../../types.js';
import {LlmClassifierNode} from "@glass-frontier/gm-api/gmGraph/nodes/classifiers/LlmClassiferNode";
import {isNonEmptyString} from "@glass-frontier/utils";
import { z } from 'zod';
import {InventoryDeltaSchema} from "@glass-frontier/dto";


export type InventoryDelta = z.infer<typeof InventoryDeltaSchema>;

class InventoryDeltaNode extends LlmClassifierNode<InventoryDelta> {
  readonly id = 'inventory-delta';
  constructor() {
    super({
      id: 'inventory-delta',
      schema: InventoryDeltaSchema,
      schemaName: 'inventory_delta_response',
      applyResult: (context, result) => this.#saveInventoryDelta(context, result),
      shouldRun: (context) => { return this.#isRunnable(context)},
      telemetryTag: 'inventory-delta'
    })
  }

  #isRunnable(context: GraphContext): boolean {
    return (
      context.playerIntent?.intentType == 'action' &&
      isNonEmptyString(context.gmResponse?.content) &&
      isNonEmptyString(context.chronicleState.chronicle.characterId)
    );
  }

  #saveInventoryDelta(context: GraphContext, result: InventoryDelta): GraphContext {
    return {
      ...context,
      inventoryDelta: result
    }
  }
}

export { InventoryDeltaNode }