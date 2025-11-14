import { z } from 'zod';

import type { GraphContext } from '../../types.js';
import type { GraphNode } from '../orchestrator.js';
import { composeGMSummaryPrompt } from '../prompts/prompts';

const SummaryResponseSchema = z.object({
  summary: z.string().min(1),
  shouldCloseChronicle: z.boolean().optional(),
});

type SummaryResponse = z.infer<typeof SummaryResponseSchema>;

class GmSummaryNode implements GraphNode {
  readonly id = 'gm-summary';

  async execute(context: GraphContext): Promise<GraphContext> {
    if (!this.#canSummarize(context)) {
      this.#recordSkip(context);
      return { ...context, failure: true };
    }

    const prompt = await composeGMSummaryPrompt({
      chronicle: context.chronicle,
      check: context.skillCheckPlan,
      checkResult: context.skillCheckResult,
      gmMessage: context.gmMessage.content,
      intent: context.playerIntent,
      templates: context.templates,
      turnSequence: context.turnSequence,
    });

    const summary = await this.#summarize(context, prompt);
    if (summary === null) {
      return { ...context, failure: true };
    }

    return {
      ...context,
      chronicleShouldClose: summary.shouldCloseChronicle === true,
      gmSummary: summary.summary,
    };
  }

  #canSummarize(context: GraphContext): boolean {
    const hasMessage = context.gmMessage !== undefined && context.gmMessage !== null;
    const hasIntent = context.playerIntent !== undefined;
    return context.failure !== true && hasMessage && hasIntent;
  }

  #recordSkip(context: GraphContext): void {
    context.telemetry?.recordToolNotRun({
      chronicleId: context.chronicleId,
      operation: 'llm.gm-summary',
    });
  }

  async #summarize(context: GraphContext, prompt: string): Promise<SummaryResponse | null> {
    try {
      const result = await context.llm.generateJson({
        maxTokens: 350,
        metadata: { chronicleId: context.chronicleId, nodeId: this.id },
        prompt,
        temperature: 0.2,
      });
      const parsed = SummaryResponseSchema.safeParse(result.json);
      if (!parsed.success) {
        return null;
      }
      const summary = parsed.data.summary.trim();
      if (summary.length === 0) {
        return null;
      }
      return {
        shouldCloseChronicle: parsed.data.shouldCloseChronicle === true,
        summary,
      };
    } catch (error: unknown) {
      context.telemetry?.recordToolError?.({
        attempt: 0,
        chronicleId: context.chronicleId,
        message: error instanceof Error ? error.message : 'unknown',
        operation: 'llm.gm-summary',
        referenceId: null,
      });
      return null;
    }
  }
}

export { GmSummaryNode };
