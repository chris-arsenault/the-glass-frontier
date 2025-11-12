import type { Intent } from '@glass-frontier/dto';
import { Attribute } from '@glass-frontier/dto';
import { randomInt } from 'node:crypto';

import type { GraphContext } from '../../types.js';
import type { GraphNode } from '../orchestrator.js';
import { composeIntentPrompt } from '../prompts/prompts';

function fallbackIntent(text: string) {
  return {
    attribute: Attribute.options[0],
    creativeSpark: false,
    intentSummary: text.slice(0, 120),
    requiresCheck: false,
    skill: 'talk',
    tone: 'narrative',
  };
}

class IntentIntakeNode implements GraphNode {
  readonly id = 'intent-intake';

  async execute(context: GraphContext): Promise<GraphContext> {
    if (context.failure) {
      context.telemetry?.recordToolNotRun({
        chronicleId: context.chronicleId,
        operation: 'llm.intent-intake',
      });
      return { ...context, failure: true };
    }
    const content: string = context.playerMessage.content ?? '';
    const prompt = await composeIntentPrompt({
      chronicle: context.chronicle,
      playerMessage: content,
      templates: context.templates,
    });
    const fallback = fallbackIntent(content);

    let parsed: Record<string, any> | null = null;

    try {
      const result = await context.llm.generateJson({
        maxTokens: 500,
        metadata: { chronicleId: context.chronicleId, nodeId: this.id },
        prompt,
        temperature: 0.1,
      });
      parsed = result.json;
    } catch (error) {
      context.telemetry?.recordToolError?.({
        attempt: 0,
        chronicleId: context.chronicleId,
        message: error instanceof Error ? error.message : 'unknown',
        operation: 'llm.intent-intake',
        referenceId: null,
      });
      return { ...context, failure: true };
    }

    const tone: string = parsed?.tone ?? fallback.tone;
    const requiresCheck: boolean =
      typeof parsed?.requiresCheck === 'boolean' ? parsed.requiresCheck : fallback.requiresCheck;
    const creativeSpark: boolean =
      typeof parsed?.creativeSpark === 'boolean' ? parsed.creativeSpark : fallback.creativeSpark;
    const skill: string = parsed.skill ?? fallback.skill;
    const attribute: Attribute =
      context.chronicle?.character?.skills?.[skill]?.attribute ??
      parsed?.attribute ??
      fallback.attribute;
    const intentSummary: string = parsed?.intentSummary ?? fallback.intentSummary;

    const playerIntent: Intent = {
      attribute,
      creativeSpark,
      intentSummary,
      metadata: {
        tags: [],
        timestamp: Date.now(),
      },
      requiresCheck,
      skill,
      tone,
    };

    return {
      ...context,
      playerIntent,
    };
  }
}

export { IntentIntakeNode };
