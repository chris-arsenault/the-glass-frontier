import type { TranscriptEntry } from '@glass-frontier/dto/narrative/TranscriptEntry';

import type { GraphContext } from '../../types.js';
import type { GraphNode } from '../orchestrator.js';
import { composeNarrationPrompt } from '../prompts/prompts';

class NarrativeWeaverNode implements GraphNode {
  readonly id = 'narrative-weaver';

  async execute(context: GraphContext): Promise<GraphContext> {
    if (context.failure || !context.playerIntent) {
      context.telemetry?.recordToolNotRun({
        chronicleId: context.chronicleId,
        operation: 'llm.narrative-weaver',
      });
      return { ...context, failure: true };
    }

    const prompt = await composeNarrationPrompt(
      context.playerIntent,
      context.chronicle,
      context.playerMessage.content,
      context.templates,
      context.skillCheckPlan,
      context.skillCheckResult?.outcomeTier
    );
    let narration: string;

    try {
      const result = await context.llm.generateText({
        maxTokens: 650,
        metadata: {
          chronicleId: context.chronicleId,
          nodeId: this.id,
        },
        prompt,
        temperature: 0.8,
      });
      narration = result.text?.trim() || '';
    } catch (error) {
      context.telemetry?.recordToolError?.({
        attempt: 0,
        chronicleId: context.chronicleId,
        message: error instanceof Error ? error.message : 'unknown',
        operation: 'llm.narrative-weaver',
      });
      return { ...context, failure: true };
    }

    const gmMessage: TranscriptEntry = {
      content: narration,
      id: `narration-${context.chronicleId}-${context.turnSequence}`,
      metadata: {
        tags: [],
        timestamp: Date.now(),
      },
      role: 'gm',
    };

    return {
      ...context,
      gmMessage,
    };
  }
}

export { NarrativeWeaverNode };
