import type { TranscriptEntry } from '@glass-frontier/dto/narrative/TranscriptEntry';

import type { GraphContext } from '../../types.js';
import type { GraphNode } from '../orchestrator.js';
import { composeNarrationPrompt } from '../prompts/prompts';

class NarrativeWeaverNode implements GraphNode {
  readonly id = 'narrative-weaver';

  async execute(context: GraphContext): Promise<GraphContext> {
    if (!this.#canWeave(context)) {
      this.#recordSkip(context);
      return { ...context, failure: true };
    }

    const prompt = await composeNarrationPrompt({
      check: context.skillCheckPlan,
      chronicle: context.chronicle,
      intent: context.playerIntent,
      outcomeTier: context.skillCheckResult?.outcomeTier,
      rawUtterance: context.playerMessage.content,
      templates: context.templates,
    });
    const narration = await this.#generateNarration(context, prompt);
    if (!narration) {
      return { ...context, failure: true };
    }

    return {
      ...context,
      gmMessage: this.#toTranscript(context, narration),
    };
  }

  #canWeave(context: GraphContext): boolean {
    return Boolean(!context.failure && context.playerIntent);
  }

  #recordSkip(context: GraphContext): void {
    context.telemetry?.recordToolNotRun({
      chronicleId: context.chronicleId,
      operation: 'llm.narrative-weaver',
    });
  }

  async #generateNarration(context: GraphContext, prompt: string): Promise<string | null> {
    try {
      const result = await context.llm.generateText({
        maxTokens: 650,
        metadata: { chronicleId: context.chronicleId, nodeId: this.id },
        prompt,
        temperature: 0.8,
      });
      return (result.text ?? '').trim();
    } catch (error) {
      context.telemetry?.recordToolError?.({
        attempt: 0,
        chronicleId: context.chronicleId,
        message: error instanceof Error ? error.message : 'unknown',
        operation: 'llm.narrative-weaver',
      });
      return null;
    }
  }

  #toTranscript(context: GraphContext, narration: string): TranscriptEntry {
    return {
      content: narration,
      id: `narration-${context.chronicleId}-${context.turnSequence}`,
      metadata: {
        tags: [],
        timestamp: Date.now(),
      },
      role: 'gm',
    };
  }
}

export { NarrativeWeaverNode };
