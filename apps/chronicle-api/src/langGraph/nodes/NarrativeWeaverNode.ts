import type { TranscriptEntry } from '@glass-frontier/dto/narrative/TranscriptEntry';
import { randomUUID } from 'node:crypto';

import type { GraphContext } from '../../types.js';
import type { GraphNode } from '../orchestrator.js';
import { composeNarrationPrompt } from '../prompts/prompts';

class NarrativeWeaverNode implements GraphNode {
  readonly id = 'narrative-weaver';

  async execute(context: GraphContext): Promise<GraphContext> {
    const rawUtterance = context.playerMessage?.content;
    if (!this.#canWeave(context, rawUtterance)) {
      this.#recordSkip(context);
      return { ...context, failure: true };
    }

    const trimmedUtterance = rawUtterance.trim();
    const prompt = await composeNarrationPrompt({
      check: context.skillCheckPlan,
      chronicle: context.chronicle,
      intent: context.playerIntent,
      outcomeTier: context.skillCheckResult?.outcomeTier,
      rawUtterance: trimmedUtterance,
      turnSequence: context.turnSequence,
      templates: context.templates,
    });
    const narration = await this.#generateNarration(context, prompt);
    if (narration === null) {
      return { ...context, failure: true };
    }

    return {
      ...context,
      gmMessage: this.#toTranscript(context, narration.text),
      gmTrace: {
        auditId: narration.requestId,
        nodeId: this.id,
        requestId: narration.requestId,
      },
    };
  }

  #canWeave(context: GraphContext, rawUtterance: string | undefined): rawUtterance is string {
    return (
      context.failure !== true &&
      context.playerIntent !== undefined &&
      isNonEmptyString(rawUtterance)
    );
  }

  #recordSkip(context: GraphContext): void {
    context.telemetry?.recordToolNotRun({
      chronicleId: context.chronicleId,
      operation: 'llm.narrative-weaver',
    });
  }

  async #generateNarration(
    context: GraphContext,
    prompt: string
  ): Promise<{ text: string; requestId: string } | null> {
    try {
      const requestId = this.#buildRequestId(context);
      const result = await context.llm.generateText({
        maxTokens: 650,
        metadata: { chronicleId: context.chronicleId, nodeId: this.id },
        prompt,
        requestId,
        temperature: 0.8,
      });
      const text = (result.text ?? '').trim();
      if (!isNonEmptyString(text)) {
        return null;
      }
      return { requestId: result.requestId, text };
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

  #buildRequestId(context: GraphContext): string {
    return `gm-${context.chronicleId}-${context.turnSequence}-${randomUUID()}`;
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

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export { NarrativeWeaverNode };
