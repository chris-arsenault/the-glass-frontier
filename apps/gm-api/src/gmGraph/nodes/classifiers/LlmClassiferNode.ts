import type { ZodObject } from 'zod';

import { GraphNode } from '../graphNode';
import { PromptComposer } from '../../../prompts/prompts';
import { zodTextFormat } from 'openai/helpers/zod';
import {GraphContext} from "../../../types";

type LlmClassifierOptions<TParsed> = {
  id: string;
  schema: ZodObject;
  schemaName: string,
  applyResult: (context: GraphContext, result: TParsed) => GraphContext;
  shouldRun: (context: GraphContext) => boolean;
  telemetryTag?: string;
};

const CLASSIFIER_MAX_TOKEN = 1000;
const CLASSIFIER_MODEL = 'gpt-5-nano';
const CLASSIFIER_REASONING = { reasoning: { effort: 'low' as const } };
const CLASSIFIER_VERBOSITY = 'low'

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
      const composer = new PromptComposer(context.templates)
      const prompt = await composer.buildPrompt(this.options.id, context);
      const json = await context.llm.generate({
        max_output_tokens: CLASSIFIER_MAX_TOKEN,
        model: CLASSIFIER_MODEL,
        ...prompt,
        metadata: {
          chronicleId: context.chronicleId,
          nodeId: this.options.id,
          loginId: context.chronicleState.chronicle.loginId
        },
        reasoning: CLASSIFIER_REASONING.reasoning,
        text: {
          format: zodTextFormat(this.options.schema, this.options.schemaName),
          verbosity: CLASSIFIER_VERBOSITY as const
        }
      }, 'json');
      const tryParsed = this.options.schema.safeParse(json.message)
      const parsed = tryParsed.data
      return this.options.applyResult(context, parsed);
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