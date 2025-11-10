import type { GraphContext } from "../../types.js";
import type { GraphNode } from "../orchestrator.js";
import { composeGMSummaryPrompt } from "../prompts/prompts";

class GmSummaryNode implements GraphNode {
  readonly id = "gm-summary";

  async execute(context: GraphContext): Promise<GraphContext> {
    if (context.failure || !context.gmMessage || !context.playerIntent) {
      context.telemetry?.recordToolNotRun({
        sessionId: context.sessionId,
        operation: "llm.gm-summary"
      });
      return {...context, failure: true}
    }
    const prompt = composeGMSummaryPrompt(context.gmMessage.content,
      context.playerIntent,
      context.skillCheckPlan,
      context.skillCheckResult
    );

    let summary: string = "";

    try {
      const result = await context.llm.generateText({
        prompt,
        temperature: 0.35,
        maxTokens: 220,
        metadata: { nodeId: this.id, sessionId: context.sessionId }
      });
      summary = result.text?.trim() || "";
    } catch (error: any) {
      context.telemetry?.recordToolError?.({
        sessionId: context.sessionId,
        operation: "llm.gm-summary",
        referenceId: null,
        attempt: 0,
        message: error instanceof Error ? error.message : "unknown"
      });
      return {...context, failure: true}
    }


    return {
      ...context,
      gmSummary: summary
    };
  }
}

export { GmSummaryNode };
