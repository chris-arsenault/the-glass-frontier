import type { PromptTemplateId } from '@glass-frontier/dto';
import { isLlmBudgetExceededError } from '@glass-frontier/llm-client';
import type { ZodType } from 'zod';

import { PromptComposer } from '../../../prompts/prompts';
import type { GraphContext } from '../../../types';
import type { GraphNode, GraphNodeDelta } from '../graphNode';

type LlmClassifierOptions<TParsed> = {
  id: PromptTemplateId;
  schema: ZodType<TParsed> | ((context: GraphContext) => ZodType<TParsed>);
  schemaName: string,
  applyResult: (context: GraphContext, result: TParsed) => GraphNodeDelta;
  shouldRun: (context: GraphContext) => boolean;
  telemetryTag?: string;
  maxOutputTokens?: number;
};

/**
 * Headroom, not length. At 1,500 the inventory-delta classifier ran out of
 * output mid-response on turn 0 of The train that runs on Warm Argument's ore,
 * three retries deep, and failed the whole turn back to the player. Schemas
 * bound these answers; a ceiling only decides whether one arrives.
 */
const CLASSIFIER_MAX_TOKEN = 16_000;
const CLASSIFIER_REASONING_EFFORT = 'low';

export class LlmClassifierNode<TParsed> implements GraphNode {
  id = 'general-classifier';

  constructor(
    private readonly options: LlmClassifierOptions<TParsed>,
  ) {}

  async execute(context: GraphContext): Promise<GraphNodeDelta> {
    if (context.failure || !this.options.shouldRun(context)) {
      context.telemetry.recordToolNotRun({
        chronicleId: context.chronicleId,
        operation: this.options.id,
      });
      return {};
    }
    return this.#classify(context);
  }

  async #classify(context: GraphContext): Promise<GraphNodeDelta> {
    try {
      const playerId = context.chronicleState.chronicle.playerId;
      const model = await context.modelConfigStore.getModelForCategory(
        'classification',
        playerId
      );
      const composer = new PromptComposer(context.templates);
      const prompt = await composer.buildPrompt(this.options.id, context);
      const schema = typeof this.options.schema === 'function'
        ? this.options.schema(context)
        : this.options.schema;
      const response = await context.llm.generateStructured(
        {
          maxOutputTokens: this.options.maxOutputTokens ?? CLASSIFIER_MAX_TOKEN,
          model,
          ...prompt,
          metadata: {
            chronicleId: context.chronicleId,
            nodeId: this.options.id,
            playerId,
            turnId: context.turnId,
            turnSequence: String(context.turnSequence)
          },
          player: context.llmPlayer,
          reasoningEffort: CLASSIFIER_REASONING_EFFORT,
        },
        schema,
        this.options.schemaName
      );

      return this.options.applyResult(context, response.data);
    } catch (error) {
      if (isLlmBudgetExceededError(error)) {
        throw error;
      }
      context.telemetry.recordToolError({
        attempt: 0,
        chronicleId: context.chronicleId,
        message: error instanceof Error ? error.message : 'unknown',
        operation: this.options.telemetryTag ?? this.options.id,
      });
      return { failure: true };
    }
  }
}
