import type { Inventory, InventoryDelta as InventoryDeltaType } from '@glass-frontier/worldstate/dto';
import { InventoryDeltaSchema } from '@glass-frontier/worldstate/dto';
import { zodTextFormat } from 'openai/helpers/zod';

import type { GraphContext, LangGraphLlmLike } from '../../types.js';
import type { GraphNode } from '../orchestrator.js';
import { composeInventoryDeltaPrompt } from '../prompts/prompts';
import { applyInventoryDelta } from './inventoryDeltaHelpers';

const INVENTORY_DELTA_FORMAT = zodTextFormat(InventoryDeltaSchema, 'inventory_delta_response');
const INVENTORY_DELTA_TEXT = {
  format: INVENTORY_DELTA_FORMAT,
  verbosity: 'low' as const,
};
const CLASSIFIER_MODEL = 'gpt-5-nano';
const CLASSIFIER_REASONING = { reasoning: { effort: 'minimal' as const } };

const resolveClassifierLlm = (context: GraphContext): LangGraphLlmLike =>
  context.llmResolver?.(CLASSIFIER_MODEL) ?? context.llm;

class InventoryDeltaNode implements GraphNode {
  readonly id = 'inventory-delta';

  async execute(context: GraphContext): Promise<GraphContext> {
    if (
      context.failure === true ||
      context.chronicle.character === undefined ||
      context.chronicle.character === null ||
      !this.#allowsDelta(context)
    ) {
      return context;
    }

    const baseline = Array.isArray(context.chronicle.character.inventory)
      ? context.chronicle.character.inventory
      : [];

    if (!this.#shouldInvokeLlm(context)) {
      return { ...context, inventoryPreview: baseline };
    }

    const llmResult = await this.#applyLlmDelta({ baseline, context });
    if (llmResult === null) {
      return { ...context, failure: true };
    }

    if (llmResult.ops.length === 0) {
      return { ...context, inventoryPreview: baseline };
    }

    return this.#buildResponse(context, llmResult);
  }

  #shouldInvokeLlm(context: GraphContext): boolean {
    const gmMessage = context.gmMessage?.content;
    const intentSummary = context.playerIntent?.intentSummary;
    const hasGmMessage = typeof gmMessage === 'string' && gmMessage.trim().length > 0;
    const hasIntentSummary = typeof intentSummary === 'string' && intentSummary.trim().length > 0;
    return hasGmMessage && hasIntentSummary;
  }

  async #applyLlmDelta({
    baseline,
    context,
  }: {
    baseline: Inventory;
    context: GraphContext;
  }): Promise<ReturnType<typeof applyInventoryDelta> | null> {
    const prompt = await composeInventoryDeltaPrompt({
      gmMessage: context.gmMessage?.content ?? '',
      gmSummary: context.gmSummary ?? '',
      intent: context.playerIntent!,
      inventory: baseline,
      templates: context.templates,
    });
    const delta = await this.#fetchInventoryDelta(context, prompt);
    if (delta === null) {
      return null;
    }
    try {
      return applyInventoryDelta(baseline, delta);
    } catch (error) {
      context.telemetry?.recordToolError?.({
        attempt: 0,
        chronicleId: context.chronicleId,
        message: error instanceof Error ? error.message : 'unknown',
        operation: 'llm.inventory-delta.apply',
        referenceId: null,
      });
      return {
        inventory: baseline,
        ops: [],
      };
    }
  }

  async #fetchInventoryDelta(context: GraphContext, prompt: string): Promise<InventoryDeltaType | null> {
    const classifier = resolveClassifierLlm(context);
    try {
      const result = await classifier.generateJson({
        maxTokens: 400,
        metadata: { chronicleId: context.chronicleId, nodeId: this.id },
        prompt,
        reasoning: CLASSIFIER_REASONING.reasoning,
        temperature: 0.1,
        text: INVENTORY_DELTA_TEXT,
      });
      const parsed = InventoryDeltaSchema.safeParse(result.json);
      console.log(parsed)
      if (!parsed.success) {
        context.telemetry?.recordToolError({
          attempt: 0,
          chronicleId: context.chronicleId,
          message: 'inventory_delta_parse_failed',
          operation: 'llm.inventory-delta.parse',
        });
        return null;
      }
      return parsed.data;
    } catch (error) {
      context.telemetry?.recordToolError({
        attempt: 0,
        chronicleId: context.chronicleId,
        message: error instanceof Error ? error.message : 'unknown',
        operation: 'llm.inventory-delta.invoke',
      });
      return null;
    }
  }

  #buildResponse(
    context: GraphContext,
    params: ReturnType<typeof applyInventoryDelta>
  ): GraphContext {
    const { inventory, ops } = params;
    return {
      ...context,
      inventoryDelta: { ops },
      inventoryPreview: inventory,
    };
  }

  #allowsDelta(context: GraphContext): boolean {
    const type = context.resolvedIntentType ?? context.playerIntent?.intentType;
    return type === 'action' || type === 'planning';
  }
}

export { InventoryDeltaNode };
