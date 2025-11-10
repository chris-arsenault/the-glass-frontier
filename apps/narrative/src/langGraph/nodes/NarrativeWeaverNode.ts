import type { GraphContext } from "../../types.js";
import type { GraphNode } from "../orchestrator.js";
import { composeNarrationPrompt } from "../prompts/prompts";
import {TranscriptEntry} from "@glass-frontier/dto/narrative/TranscriptEntry";

class NarrativeWeaverNode implements GraphNode {
  readonly id = "narrative-weaver";

  async execute(context: GraphContext): Promise<GraphContext> {
    if (context.failure || !context.playerIntent ) {
        context.telemetry?.recordToolNotRun({
          sessionId: context.sessionId,
          operation: "llm.narrative-weaver"
        });
        return {...context, failure: true}
    }

    const prompt = composeNarrationPrompt(context.playerIntent, context.session, context.playerMessage.content, context.skillCheckPlan, context.skillCheckResult?.outcomeTier)
    let narration: string;

    try {
      const result = await context.llm.generateText({
        prompt,
        temperature: 0.8,
        maxTokens: 650,
        metadata: {
          nodeId: this.id,
          sessionId: context.sessionId,
        }
      });
      narration = result.text?.trim() || "";
    } catch (error) {
      context.telemetry?.recordToolError?.({
        sessionId: context.sessionId,
        operation: "llm.narrative-weaver",
        attempt: 0,
        message: error instanceof Error ? error.message : "unknown"
      });
      return {...context, failure: true}
    }

    const gmMessage: TranscriptEntry = {
      id: `narration-${context.sessionId}-${context.turnSequence}`,
      role: 'gm',
      content:  narration,
      metadata: {
        timestamp: Date.now(),
        tags: []
      }
    }

    return {
      ...context,
      gmMessage,
    };
  }
}

export { NarrativeWeaverNode };
