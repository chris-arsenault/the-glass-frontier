import type { ZodObject } from 'zod';

import { GraphNode } from '../graphNode';
import { PromptComposer } from '../../../prompts/prompts';
import {GraphContext} from "../../../types";

type LlmClassifierOptions<TParsed> = {
  id: string;
  schema: ZodObject;
  schemaName: string,
  applyResult: (context: GraphContext, result: TParsed) => GraphContext;
  shouldRun: (context: GraphContext) => boolean;
  telemetryTag?: string;
};

const CLASSIFIER_MAX_TOKEN = 1500;
const CLASSIFIER_REASONING = { reasoning: { effort: 'low' as const } };
const CLASSIFIER_VERBOSITY = 'low';
const FALLBACK_CLASSIFIER_MODEL = 'gpt-5-nano';

export class LlmClassifierNode<TParsed> implements GraphNode {
  id = 'general-classifier';

  constructor(
    private readonly options: LlmClassifierOptions<TParsed>,
  ) {}

  async execute(context: GraphContext): Promise<GraphContext> {
    if (context.failure || !this.options.shouldRun(context)) {
      context.telemetry?.recordToolNotRun?.({
        chronicleId: context.chronicleId,

        operation: this.options.id,
      });
      return context;
    }
    try {
      const playerId = context.chronicleState.chronicle.playerId;
      let model: string;
      try {
        model = await context.modelConfigStore.getModelForCategory('classification', playerId);
      } catch (error) {
        // Fallback to default model if lookup fails
        model = FALLBACK_CLASSIFIER_MODEL;
      }

      const composer = new PromptComposer(context.templates)
      const prompt = await composer.buildPrompt(this.options.id, context);

      const response = await context.llm.generateStructured(
        {
          max_output_tokens: CLASSIFIER_MAX_TOKEN,
          model,
          ...prompt,
          metadata: {
            chronicleId: context.chronicleId,
            turnId: context.turnId,
            turnSequence: String(context.turnSequence),
            nodeId: this.options.id,
            playerId
          },
          reasoning: CLASSIFIER_REASONING.reasoning,
          text: {
            verbosity: CLASSIFIER_VERBOSITY as const
          }
        },
        this.options.schema,
        this.options.schemaName
      );

      return this.options.applyResult(context, response.data);
    } catch (error) {
      context.telemetry?.recordToolError?.({
        attempt: 0,
        chronicleId: context.chronicleId,
        message: error instanceof Error ? error.message : 'unknown',
        operation: this.options.telemetryTag ?? this.options.id,
      });
      return { ...context, failure: true };
    }
  }
}
