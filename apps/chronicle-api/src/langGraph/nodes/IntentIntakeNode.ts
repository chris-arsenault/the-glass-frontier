import type { Intent } from '@glass-frontier/dto';
import { Attribute } from '@glass-frontier/dto';
import { IntentType as IntentTypeSchema } from '@glass-frontier/dto';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import type { GraphContext, LangGraphLlmLike } from '../../types.js';
import type { GraphNode } from '../orchestrator.js';
import { composeIntentPrompt } from '../prompts/prompts';

const IntentResponseSchema = z.object({
  creativeSpark: z
    .boolean()
    .describe('True when the player intent expresses improvisational or imaginative action.'),
  handlerHints: z
    .array(
      z
        .string()
        .min(1)
        .describe('Lowercase hint that nudges downstream narration (e.g., "whispered").')
    )
    .describe('Ordered list of handler hints; emit an empty array when none apply.'),
  intentSummary: z
    .string()
    .min(1)
    .describe('Concise paraphrase of the player’s request (≤ 140 characters).'),
  intentType: IntentTypeSchema.describe('One of the canonical Glass Frontier intent types.'),
  requiresCheck: z
    .boolean()
    .describe('True when the move is risky, contested, or otherwise requires a skill check.'),
  routerConfidence: z
    .number()
    .min(0)
    .max(1)
    .describe('Float between 0-1 capturing classifier confidence in the chosen intent type.'),
  routerRationale: z
    .string()
    .min(1)
    .describe('Single sentence explaining why the classification was chosen.'),
  tone: z.string().min(1).describe('Narrative tone adjective grounded in the current scene.'),
});

type IntentResponse = z.infer<typeof IntentResponseSchema>;

const DEFAULT_SKILL = 'talk';
const DEFAULT_TONE = 'narrative';
const DEFAULT_ATTRIBUTE = Attribute.options[0];
const CLASSIFIER_MODEL = 'gpt-5-nano';
const CLASSIFIER_REASONING = { reasoning: { effort: 'minimal' as const } };
const INTENT_RESPONSE_FORMAT = zodTextFormat(IntentResponseSchema, 'intent_intake_response');
const INTENT_TEXT_SETTINGS = {
  format: INTENT_RESPONSE_FORMAT,
  verbosity: 'low' as const,
};

const resolveClassifierLlm = (context: GraphContext): LangGraphLlmLike =>
  context.llmResolver?.(CLASSIFIER_MODEL) ?? context.llm;

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
    if (response === null) {
      return { ...context, failure: true };
    }

    const playerIntent = this.#buildIntent(response, content);
    const resolvedIntentType =
      this.#normalizeIntentType(playerIntent.intentType) ?? ('action' as Intent['intentType']);
    const resolvedConfidence = this.#normalizeConfidence(response.routerConfidence);

    return {
      ...context,
      playerIntent: {
        ...playerIntent,
        intentType: resolvedIntentType,
        routerConfidence: resolvedConfidence,
      },
      resolvedIntentConfidence: resolvedConfidence ?? context.resolvedIntentConfidence,
      resolvedIntentType,
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
      const classifier = resolveClassifierLlm(context);
      const result = await classifier.generateJson({
        maxTokens: 500,
        metadata: { chronicleId: context.chronicleId, nodeId: this.id },
        prompt,
        reasoning: CLASSIFIER_REASONING.reasoning,
        temperature: 0.1,
        text: INTENT_TEXT_SETTINGS,
      });
      const parsed = IntentResponseSchema.safeParse(result.json);
      return parsed.success ? parsed.data : null;
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

  #buildIntent(response: IntentResponse, message: string): Intent {
    const tone = this.#normalizeString(response.tone) ?? DEFAULT_TONE;
    const requiresCheck = response.requiresCheck ?? false;
    const creativeSpark = response.creativeSpark ?? false;
    const intentSummary = this.#deriveSummary(response.intentSummary, message);
    const handlerHints = this.#normalizeStringArray(response.handlerHints);

    return {
      attribute: DEFAULT_ATTRIBUTE,
      beatDirective: undefined,
      creativeSpark,
      handlerHints: handlerHints ?? undefined,
      intentSummary,
      intentType: this.#normalizeIntentType(response.intentType),
      metadata: {
        tags: [],
        timestamp: Date.now(),
      },
      requiresCheck,
      routerConfidence: this.#normalizeConfidence(response.routerConfidence),
      routerRationale: this.#normalizeString(response.routerRationale) ?? undefined,
      skill: DEFAULT_SKILL,
      tone,
    };
  }

  #deriveSummary(override: string, message: string): string {
    const normalized = this.#normalizeString(override);
    if (normalized !== null) {
      return normalized;
    }
    const trimmed = message.trim();
    if (trimmed.length === 0) {
      return 'No intent provided.';
    }
    return trimmed.length > 120 ? `${trimmed.slice(0, 117)}…` : trimmed;
  }

  #normalizeString(value?: string | null): string | null {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    return null;
  }

  #normalizeConfidence(value?: number): number | undefined {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return undefined;
    }
    if (value < 0) {
      return 0;
    }
    if (value > 1) {
      return 1;
    }
    return value;
  }

  #normalizeStringArray(values?: string[] | null): string[] | null {
    if (!Array.isArray(values)) {
      return null;
    }
    const normalized = values
      .map((entry) => this.#normalizeString(entry))
      .filter((entry): entry is string => entry !== null);
    return normalized.length > 0 ? normalized : null;
  }

  #normalizeIntentType(value?: Intent['intentType'] | null): Intent['intentType'] | undefined {
    if (
      value === 'action' ||
      value === 'inquiry' ||
      value === 'clarification' ||
      value === 'possibility' ||
      value === 'planning' ||
      value === 'reflection'
    ) {
      return value;
    }
    return undefined;
  }
}

export { IntentIntakeNode };
