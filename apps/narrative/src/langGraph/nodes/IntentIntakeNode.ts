import type { Intent } from '@glass-frontier/dto';
import { Attribute } from '@glass-frontier/dto';
import { z } from 'zod';

import type { GraphContext } from '../../types.js';
import type { GraphNode } from '../orchestrator.js';
import { composeIntentPrompt } from '../prompts/prompts';

const IntentResponseSchema = z.object({
  attribute: z.string().optional(),
  creativeSpark: z.boolean().optional(),
  intentSummary: z.string().optional(),
  requiresCheck: z.boolean().optional(),
  skill: z.string().optional(),
  tone: z.string().optional(),
});

type IntentResponse = z.infer<typeof IntentResponseSchema>;

const DEFAULT_SKILL = 'talk';
const DEFAULT_TONE = 'narrative';
const DEFAULT_ATTRIBUTE = Attribute.options[0];

class IntentIntakeNode implements GraphNode {
  readonly id = 'intent-intake';

  async execute(context: GraphContext): Promise<GraphContext> {
    if (context.failure) {
      this.#recordSkip(context);
      return { ...context, failure: true };
    }

    const content = context.playerMessage.content ?? '';
    const prompt = await composeIntentPrompt({
      chronicle: context.chronicle,
      playerMessage: content,
      templates: context.templates,
    });

    const response = await this.#requestIntent(context, prompt);
    if (!response) {
      return { ...context, failure: true };
    }

    const playerIntent = this.#buildIntent(context, response, content);

    return {
      ...context,
      playerIntent,
    };
  }

  #recordSkip(context: GraphContext): void {
    context.telemetry?.recordToolNotRun({
      chronicleId: context.chronicleId,
      operation: 'llm.intent-intake',
    });
  }

  async #requestIntent(
    context: GraphContext,
    prompt: string
  ): Promise<IntentResponse | null> {
    try {
      const result = await context.llm.generateJson({
        maxTokens: 500,
        metadata: { chronicleId: context.chronicleId, nodeId: this.id },
        prompt,
        temperature: 0.1,
      });
      const parsed = IntentResponseSchema.safeParse(result.json);
      return parsed.success ? parsed.data : {};
    } catch (error) {
      context.telemetry?.recordToolError?.({
        attempt: 0,
        chronicleId: context.chronicleId,
        message: error instanceof Error ? error.message : 'unknown',
        operation: 'llm.intent-intake',
        referenceId: null,
      });
      return null;
    }
  }

  #buildIntent(context: GraphContext, response: IntentResponse, message: string): Intent {
    const tone = this.#normalizeString(response.tone) ?? DEFAULT_TONE;
    const skill = this.#normalizeString(response.skill) ?? DEFAULT_SKILL;
    const requiresCheck = response.requiresCheck ?? false;
    const creativeSpark = response.creativeSpark ?? false;
    const intentSummary = this.#deriveSummary(response.intentSummary, message);
    const attribute = this.#deriveAttribute(context, skill, response.attribute);

    return {
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
  }

  #deriveSummary(override: string | undefined, message: string): string {
    const normalized = this.#normalizeString(override);
    if (normalized) {
      return normalized;
    }
    const trimmed = message.trim();
    if (!trimmed) {
      return 'No intent provided.';
    }
    return trimmed.length > 120 ? `${trimmed.slice(0, 117)}…` : trimmed;
  }

  #deriveAttribute(context: GraphContext, skill: string, override?: string): string {
    const skillAttribute = context.chronicle.character?.skills?.[skill]?.attribute;
    if (skillAttribute) {
      return skillAttribute;
    }
    if (override && Attribute.safeParse(override).success) {
      return override;
    }
    return DEFAULT_ATTRIBUTE;
  }

  #normalizeString(value?: string | null): string | null {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    }
    return null;
  }
}

export { IntentIntakeNode };
