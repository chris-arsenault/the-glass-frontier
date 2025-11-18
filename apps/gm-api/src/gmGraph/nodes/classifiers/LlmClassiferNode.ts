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
  telemetryTag?: string;
};

const CLASSIFIER_MAX_TOKEN = 500;
const CLASSIFIER_MODEL = 'gpt-5-nano';
const CLASSIFIER_REASONING = { reasoning: { effort: 'minimal' as const } };

export class LlmClassifierNode<TParsed> implements GraphNode {
  id = 'general-classifier';

  constructor(
    private readonly options: LlmClassifierOptions<TParsed>,
  ) {}

  async execute(context: GraphContext): Promise<GraphContext> {

    if (context.failure) {
      context.telemetry?.recordToolNotRun?.({
        chronicleId: context.chronicleId,

        operation: this.options.id,
      });
      return context;
    }
    try {
      const composer = new PromptComposer(context.templates)
      console.log(composer)
      const prompt = await composer.buildPrompt(this.options.id, context);
      console.log(prompt);
      const json = await context.llm.generate({
        max_tokens: CLASSIFIER_MAX_TOKEN,
        model: CLASSIFIER_MODEL,
        instructions: prompt.instructions,
        input: prompt.input,
        metadata: { chronicleId: context.chronicleId, nodeId: this.options.id },
        prompt,
        reasoning: CLASSIFIER_REASONING.reasoning,
        text: {
          format: zodTextFormat(this.options.schema, this.options.schemaName),
          verbosity: 'low' as const
        }
      }, 'json');
      console.log(json.message);
      const parsed = this.options.schema.safeParse(json.message).data
      console.log(parsed);
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