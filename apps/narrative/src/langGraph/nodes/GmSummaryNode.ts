import type { GraphContext } from '../../types.js';
import type { GraphNode } from '../orchestrator.js';
import { composeGMSummaryPrompt } from '../prompts/prompts';

class GmSummaryNode implements GraphNode {
  readonly id = 'gm-summary';

  async execute(context: GraphContext): Promise<GraphContext> {
    if (!this.#canSummarize(context)) {
      this.#recordSkip(context);
      return { ...context, failure: true };
    }

    const prompt = await composeGMSummaryPrompt({
      check: context.skillCheckPlan,
      checkResult: context.skillCheckResult,
      gmMessage: context.gmMessage.content,
      intent: context.playerIntent,
      templates: context.templates,
    });

    const summary = await this.#summarize(context, prompt);
    if (summary === null) {
      return { ...context, failure: true };
    }

    return {
      ...context,
      gmSummary: summary,
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

  async #summarize(context: GraphContext, prompt: string): Promise<string | null> {
    try {
      const result = await context.llm.generateText({
        maxTokens: 220,
        metadata: { chronicleId: context.chronicleId, nodeId: this.id },
        prompt,
        temperature: 0.35,
      });
      return (result.text ?? '').trim();
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
