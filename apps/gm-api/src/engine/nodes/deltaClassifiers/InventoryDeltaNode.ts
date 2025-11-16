import type { InventoryDelta } from '@glass-frontier/worldstate';
import { InventoryDeltaSchema } from '@glass-frontier/worldstate';

import { composeInventoryDeltaPrompt } from '../../prompts';
import { LlmClassifierNode } from '../classifiers/LlmClassifierNode';
import type { StructuredLlmClient } from '../structuredLlmClient';

export class InventoryDeltaNode extends LlmClassifierNode<InventoryDelta> {
  constructor(client: StructuredLlmClient) {
    super(client, {
      applyResult: (context, result) => ({
        ...context,
        effects: {
          ...context.effects,
          inventoryDelta: result,
        },
        turnDraft: {
          ...context.turnDraft,
          inventoryDelta: result,
        },
      }),
      buildPrompt: (context) => {
        if (context.character === null) {
          return {
            model: 'gpt-4.1-mini',
            templateId: 'inventory-delta',
            variables: {
              characterSummary: 'Unknown character',
              gmMessage: '',
              gmSummary: '',
              intentSummary: '',
              inventorySnapshot: 'No inventory assigned.',
              pendingEquip: 'No pending equipment changes.',
            },
          };
        }
        return composeInventoryDeltaPrompt({
          character: context.character,
          gmMessage: context.turnDraft.gmMessage?.content ?? '',
          gmSummary: context.turnDraft.gmSummary ?? '',
          intentSummary: context.turnDraft.playerIntent?.summary,
          inventory: context.character.inventory,
          pendingEquip: [],
        });
      },
      id: 'inventory-delta',
      schema: InventoryDeltaSchema,
      telemetryTag: 'llm.inventory-delta',
    });
  }
}
