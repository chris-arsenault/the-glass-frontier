import type { GraphContext } from '../../types.js';
import type { GraphNode } from '../orchestrator.js';
import { composeGMSummaryPrompt } from '../prompts/prompts';

class GmSummaryNode implements GraphNode {
  readonly id = 'gm-summary';

  async execute(context: GraphContext): Promise<GraphContext> {
    if (context.failure || !context.gmMessage || !context.playerIntent) {
      context.telemetry?.recordToolNotRun({
        chronicleId: context.chronicleId,
        operation: 'llm.gm-summary',
      });
      return { ...context, failure: true };
    }
    const prompt = await composeGMSummaryPrompt(
      context.templates,
      context.gmMessage.content,
      context.playerIntent,
      context.skillCheckPlan,
      context.skillCheckResult
    );

    let summary = '';

    try {
      const result = await context.llm.generateText({
        maxTokens: 220,
        metadata: { chronicleId: context.chronicleId, nodeId: this.id },
        prompt,
        temperature: 0.35,
      });
      summary = result.text?.trim() || '';
    } catch (error: any) {
      context.telemetry?.recordToolError?.({
        attempt: 0,
        chronicleId: context.chronicleId,
        message: error instanceof Error ? error.message : 'unknown',
        operation: 'llm.gm-summary',
        referenceId: null,
      });
      return { ...context, failure: true };
    }

    return {
      ...context,
      gmSummary: summary,
    };
  }
}

export { GmSummaryNode };
