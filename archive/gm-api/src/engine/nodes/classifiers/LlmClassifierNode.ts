import type { ZodSchema } from 'zod';

import type { GraphContext, GraphNode } from '../../graphNode';
import type { ClassifierPrompt } from '../../prompts';
import type { StructuredLlmClient } from '../structuredLlmClient';

type LlmClassifierOptions<TParsed> = {
  id: string;
  schema: ZodSchema<TParsed>;
  buildPrompt: (context: GraphContext) => Promise<ClassifierPrompt> | ClassifierPrompt;
  applyResult: (context: GraphContext, result: TParsed) => GraphContext;
  telemetryTag?: string;
};

export class LlmClassifierNode<TParsed> implements GraphNode {
  constructor(
    private readonly client: StructuredLlmClient,
    private readonly options: LlmClassifierOptions<TParsed>
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
      const prompt = await this.options.buildPrompt(context);
      const parsed = await this.client.generateStructured({
        metadata: { chronicleId: context.chronicleId, nodeId: this.options.id },
        model: prompt.model,
        schema: this.options.schema,
        templateId: prompt.templateId,
        variables: prompt.variables,
      });
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
