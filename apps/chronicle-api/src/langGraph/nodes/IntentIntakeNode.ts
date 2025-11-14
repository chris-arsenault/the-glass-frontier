import type { Intent } from '@glass-frontier/dto';
import { Attribute } from '@glass-frontier/dto';
import { z } from 'zod';

import type { GraphContext } from '../../types.js';
import type { GraphNode } from '../orchestrator.js';
import { composeIntentPrompt } from '../prompts/prompts';

const BeatDirectiveSchema = z.object({
  kind: z.enum(['independent', 'existing', 'new']).optional(),
  summary: z.string().optional(),
  targetBeatId: z.string().nullable().optional(),
});

const IntentResponseSchema = z.object({
  attribute: z.string().optional(),
  beatDirective: BeatDirectiveSchema.optional(),
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
    if (response === null) {
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
      beatDirective: this.#buildBeatDirective(context, response.beatDirective),
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
    if (normalized !== null) {
      return normalized;
    }
    const trimmed = message.trim();
    if (trimmed.length === 0) {
      return 'No intent provided.';
    }
    return trimmed.length > 120 ? `${trimmed.slice(0, 117)}…` : trimmed;
  }

  #deriveAttribute(context: GraphContext, skill: string, override?: string): string {
    return (
      this.#attributeFromSkill(context, skill) ??
      this.#attributeFromOverride(override) ??
      DEFAULT_ATTRIBUTE
    );
  }

  #normalizeString(value?: string | null): string | null {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    return null;
  }

  #attributeFromSkill(context: GraphContext, skill: string): string | null {
    const skills = context.chronicle.character?.skills;
    if (skills === undefined || skills === null) {
      return null;
    }

    for (const [name, entry] of Object.entries(skills)) {
      if (name !== skill) {
        continue;
      }
      if (entry === undefined || entry === null) {
        continue;
      }
      if (typeof entry.attribute !== 'string') {
        continue;
      }

      const trimmed = entry.attribute.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }

    return null;
  }

  #attributeFromOverride(value?: string): string | null {
    const candidate = this.#normalizeString(value);
    if (candidate === null) {
      return null;
    }
    return Attribute.safeParse(candidate).success ? candidate : null;
  }

  #buildBeatDirective(
    context: GraphContext,
    directive?: z.infer<typeof BeatDirectiveSchema> | null
  ): Intent['beatDirective'] | undefined {
    if (directive === undefined || directive === null || directive.kind === undefined) {
      return undefined;
    }
    const kind = this.#normalizeBeatDirectiveKind(directive.kind);
    if (kind === null) {
      return undefined;
    }
    const summary = this.#normalizeString(directive.summary) ?? undefined;
    if (kind === 'existing') {
      const beatId = this.#normalizeBeatId(context, directive.targetBeatId);
      if (beatId === null) {
        return undefined;
      }
      return { kind, summary, targetBeatId: beatId };
    }
    return { kind, summary };
  }

  #normalizeBeatDirectiveKind(
    value?: z.infer<typeof BeatDirectiveSchema>['kind']
  ): 'existing' | 'new' | 'independent' | null {
    if (value === 'existing' || value === 'new' || value === 'independent') {
      return value;
    }
    return null;
  }

  #normalizeBeatId(context: GraphContext, candidate?: string | null): string | null {
    const normalized = this.#normalizeString(candidate);
    if (normalized === null) {
      return null;
    }
    const openIds = this.#getOpenBeatIds(context);
    return openIds.has(normalized) ? normalized : null;
  }

  #getOpenBeatIds(context: GraphContext): Set<string> {
    const beats = context.chronicle.chronicle?.beats;
    if (!Array.isArray(beats) || beats.length === 0) {
      return new Set();
    }
    const ids = beats
      .filter((beat) => beat?.status === 'in_progress')
      .map((beat) => beat?.id)
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
    return new Set(ids);
  }
}

export { IntentIntakeNode };
