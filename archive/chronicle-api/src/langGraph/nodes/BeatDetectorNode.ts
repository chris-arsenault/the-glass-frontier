import type { Intent } from '@glass-frontier/dto';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import type { GraphContext, LangGraphLlmLike } from '../../types';
import type { GraphNode } from '../orchestrator';
import { composeIntentBeatDetectorPrompt } from '../prompts/prompts';

const BeatDirectiveSchema = z.object({
  beatDirective: z
    .object({
      kind: z
        .enum(['existing', 'new', 'independent'])
        .describe('Classification describing whether the turn advances an existing beat, creates a new one, or stands alone.'),
      summary: z
        .string()
        .min(1)
        .describe('Short justification pointing to the stakes or clue driving the decision.'),
      targetBeatId: z
        .string()
        .min(1)
        .nullable()
        .describe('ID of the referenced beat when kind is "existing"; null otherwise.'),
    })
    .describe('Directive that downstream beat tracking should apply to this intent.'),
});

const CLASSIFIER_MODEL = 'gpt-5-nano';
const CLASSIFIER_REASONING = { reasoning: { effort: 'minimal' as const } };
const BEAT_DIRECTIVE_FORMAT = zodTextFormat(BeatDirectiveSchema, 'intent_beat_detector');
const BEAT_DETECTOR_TEXT = {
  format: BEAT_DIRECTIVE_FORMAT,
  verbosity: 'low' as const,
};

const resolveClassifierLlm = (context: GraphContext): LangGraphLlmLike =>
  context.llmResolver?.(CLASSIFIER_MODEL) ?? context.llm;

class BeatDetectorNode implements GraphNode {
  readonly id = 'intent-beat-detector';

  async execute(context: GraphContext): Promise<GraphContext> {
    if (!this.#shouldRun(context)) {
      return context;
    }
    const intentType = context.resolvedIntentType ?? context.playerIntent.intentType ?? 'action';
    const prompt = await composeIntentBeatDetectorPrompt({
      chronicle: context.chronicle,
      intentSummary: context.playerIntent.intentSummary,
      intentType,
      playerMessage: context.playerMessage.content ?? '',
      templates: context.templates,
    });
    const classifier = resolveClassifierLlm(context);
    try {
      const response = await classifier.generateJson({
        maxTokens: 400,
        metadata: { chronicleId: context.chronicleId, nodeId: this.id },
        prompt,
        reasoning: CLASSIFIER_REASONING.reasoning,
        temperature: 0,
        text: BEAT_DETECTOR_TEXT,
      });
      const parsed = BeatDirectiveSchema.safeParse(response.json);
      if (!parsed.success) {
        return { ...context, failure: true };
      }
      const beatDirective = this.#normalizeDirective(parsed.data.beatDirective);
      return {
        ...context,
        playerIntent: {
          ...context.playerIntent,
          beatDirective,
        },
      };
    } catch (error) {
      context.telemetry?.recordToolError?.({
        attempt: 0,
        chronicleId: context.chronicleId,
        message: error instanceof Error ? error.message : 'unknown',
        operation: 'llm.intent-beat-detector',
      });
      return { ...context, failure: true };
    }
  }

  #shouldRun(context: GraphContext): boolean {
    return context.failure !== true && context.playerIntent !== undefined;
  }

  #normalizeDirective(
    directive: z.infer<typeof BeatDirectiveSchema>['beatDirective']
  ): Intent['beatDirective'] {
    if (directive.kind === 'existing' && typeof directive.targetBeatId === 'string') {
      return { kind: 'existing', summary: directive.summary, targetBeatId: directive.targetBeatId };
    }
    if (directive.kind === 'new') {
      return { kind: 'new', summary: directive.summary };
    }
    return { kind: 'independent', summary: directive.summary };
  }
}

export { BeatDetectorNode };
