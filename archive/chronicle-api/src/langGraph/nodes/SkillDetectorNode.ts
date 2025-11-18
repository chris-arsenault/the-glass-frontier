import { Attribute } from '@glass-frontier/dto';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import type { GraphContext, LangGraphLlmLike } from '../../types';
import type { GraphNode } from '../orchestrator';
import { composeSkillDetectorPrompt } from '../prompts/prompts';

const SkillDetectionSchema = z.object({
  attribute: Attribute.describe('The attribute that best matches the described approach.'),
  handlerHints: z
    .array(
      z
        .string()
        .min(1)
        .describe('Lowercase handler hint describing narration cues (e.g., "whispered").')
    )
    .describe('Optional narration hints; emit an empty array when none apply.'),
  skill: z
    .string()
    .min(1)
    .describe('Best-fit skill name, preferring existing skills when relevant.'),
});

const CLASSIFIER_MODEL = 'gpt-5-nano';
const CLASSIFIER_REASONING = { reasoning: { effort: 'minimal' as const } };
const SKILL_DETECTOR_FORMAT = zodTextFormat(SkillDetectionSchema, 'skill_detector');
const SKILL_DETECTOR_TEXT = {
  format: SKILL_DETECTOR_FORMAT,
  verbosity: 'low' as const,
};

const resolveClassifierLlm = (context: GraphContext): LangGraphLlmLike =>
  context.llmResolver?.(CLASSIFIER_MODEL) ?? context.llm;

class SkillDetectorNode implements GraphNode {
  readonly id = 'skill-detector';

  async execute(context: GraphContext): Promise<GraphContext> {
    if (!this.#shouldRun(context)) {
      return context;
    }

    const intentType = context.resolvedIntentType ?? context.playerIntent?.intentType ?? 'action';
    const prompt = await composeSkillDetectorPrompt({
      chronicle: context.chronicle,
      intentSummary: context.playerIntent!.intentSummary,
      intentType,
      playerMessage: context.playerMessage.content ?? '',
      templates: context.templates,
    });

    const detection = await this.#runDetection(context, prompt);
    if (detection === null) {
      return { ...context, failure: true };
    }
    return this.#applyDetection(context, detection);
  }

  #shouldRun(context: GraphContext): boolean {
    const intentType = context.resolvedIntentType ?? context.playerIntent?.intentType;
    if (context.failure === true) {
      return false;
    }
    if (context.playerIntent === undefined) {
      return false;
    }
    return intentType === 'action' || intentType === 'inquiry';
  }

  async #runDetection(
    context: GraphContext,
    prompt: string
  ): Promise<z.infer<typeof SkillDetectionSchema> | null> {
    const classifier = resolveClassifierLlm(context);
    try {
      const response = await classifier.generateJson({
        maxTokens: 350,
        metadata: { chronicleId: context.chronicleId, nodeId: this.id },
        prompt,
        reasoning: CLASSIFIER_REASONING.reasoning,
        temperature: 0,
        text: SKILL_DETECTOR_TEXT,
      });
      const parsed = SkillDetectionSchema.safeParse(response.json);
      return parsed.success ? parsed.data : null;
    } catch (error) {
      context.telemetry?.recordToolError?.({
        attempt: 0,
        chronicleId: context.chronicleId,
        message: error instanceof Error ? error.message : 'unknown',
        operation: 'llm.skill-detector',
      });
      return null;
    }
  }

  #applyDetection(
    context: GraphContext,
    data: z.infer<typeof SkillDetectionSchema>
  ): GraphContext {
    const handlerHints = this.#mergeHints(context.playerIntent?.handlerHints, data.handlerHints);
    return {
      ...context,
      playerIntent: {
        ...context.playerIntent!,
        attribute: data.attribute ?? context.playerIntent!.attribute,
        handlerHints,
        skill: this.#resolveSkill(data.skill, context.playerIntent!.skill),
      },
    };
  }

  #resolveSkill(candidate: string | undefined, fallback: string): string {
    const normalized = typeof candidate === 'string' ? candidate.trim() : '';
    if (normalized.length > 0) {
      return normalized;
    }
    return fallback;
  }

  #mergeHints(existing?: string[], next?: string[]): string[] | undefined {
    const merged = [...(existing ?? []), ...(next ?? [])]
      .map((hint) => (typeof hint === 'string' ? hint.trim().toLowerCase() : ''))
      .filter((hint) => hint.length > 0);
    if (merged.length === 0) {
      return existing;
    }
    return Array.from(new Set(merged));
  }
}

export { SkillDetectorNode };
