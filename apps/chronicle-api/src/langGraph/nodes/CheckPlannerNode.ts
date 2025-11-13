import { RiskLevel as RiskLevelSchema } from '@glass-frontier/dto';
import type { SkillCheckPlan, SkillCheckRequest, RiskLevel } from '@glass-frontier/dto';
import { SkillCheckResolver } from '@glass-frontier/skill-check-resolver';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import type { GraphContext } from '../../types.js';
import type { GraphNode } from '../orchestrator.js';
import { composeCheckRulesPrompt } from '../prompts/prompts';

const PlannerPlanSchema = z.object({
  advantage: z.string().optional(),
  complicationSeeds: z.array(z.string()).optional(),
  rationale: z.union([z.string(), z.array(z.string())]).optional(),
  riskLevel: RiskLevelSchema.optional(),
});

type PlannerPlanFields = z.infer<typeof PlannerPlanSchema>;

type PlannerPlan = {
  advantage: string;
  complicationSeeds: string[];
  rationale: string;
  riskLevel: RiskLevel;
};

const FALLBACK_PLAN: PlannerPlan = {
  advantage: 'none',
  complicationSeeds: ['The universe disagrees with your intent.'],
  rationale: 'You cannot quite recall how to do that.',
  riskLevel: 'standard',
};

class CheckPlannerNode implements GraphNode {
  readonly id = 'check-planner';

  async execute(context: GraphContext): Promise<GraphContext> {
    if (context.failure) {
      this.#recordNotRun(context);
      return { ...context, failure: true };
    }

    if (
      context.playerIntent === undefined ||
      context.playerIntent.requiresCheck !== true ||
      context.chronicle.character === undefined ||
      context.chronicle.character === null
    ) {
      return { ...context, skillCheckResult: undefined };
    }

    const prompt = await composeCheckRulesPrompt(
      context.playerIntent,
      context.chronicle,
      context.templates
    );

    const playerIntent = context.playerIntent;
    const character = context.chronicle.character;

    const overrides = await this.#requestPlan(context, prompt);
    if (overrides === null) {
      return { ...context, failure: true };
    }

    const plan = this.#mergePlan(overrides);
    const skillCheckPlan = this.#toSkillCheckPlan(plan);
    const flags = this.#buildFlags(playerIntent, plan.advantage);
    const skillCheckResult = this.#resolveSkillCheck({
      character,
      context,
      flags,
      playerIntent,
      riskLevel: plan.riskLevel,
    });

    return {
      ...context,
      skillCheckPlan,
      skillCheckResult,
    };
  }

  #recordNotRun(context: GraphContext): void {
    context.telemetry?.recordToolNotRun({
      chronicleId: context.chronicleId,
      operation: 'llm.check-planner',
    });
  }

  async #requestPlan(
    context: GraphContext,
    prompt: string
  ): Promise<PlannerPlanFields | null> {
    try {
      const result = await context.llm.generateJson({
        maxTokens: 700,
        metadata: { chronicleId: context.chronicleId, nodeId: this.id },
        prompt,
        temperature: 0.25,
      });
      const parsed = PlannerPlanSchema.safeParse(result.json);
      return parsed.success ? parsed.data : {};
    } catch (error) {
      context.telemetry?.recordToolError?.({
        attempt: 0,
        chronicleId: context.chronicleId,
        message: error instanceof Error ? error.message : 'unknown',
        operation: 'llm.check-planner',
      });
      return null;
    }
  }

  #mergePlan(overrides?: PlannerPlanFields | null): PlannerPlan {
    return {
      advantage: this.#normalizeString(overrides?.advantage) ?? FALLBACK_PLAN.advantage,
      complicationSeeds:
        this.#normalizeStringArray(overrides?.complicationSeeds) ?? FALLBACK_PLAN.complicationSeeds,
      rationale: this.#normalizeRationale(overrides?.rationale) ?? FALLBACK_PLAN.rationale,
      riskLevel: overrides?.riskLevel ?? FALLBACK_PLAN.riskLevel,
    };
  }

  #toSkillCheckPlan(plan: PlannerPlan): SkillCheckPlan {
    return {
      advantage: plan.advantage,
      complicationSeeds: plan.complicationSeeds,
      metadata: {
        tags: [],
        timestamp: Date.now(),
      },
      rationale: plan.rationale,
      riskLevel: plan.riskLevel,
    };
  }

  #buildFlags(playerIntent: NonNullable<GraphContext['playerIntent']>, advantage: string): string[] {
    const flags: string[] = [];
    if (advantage !== 'none') {
      flags.push(advantage);
    }
    if (playerIntent.creativeSpark === true) {
      flags.push('creative-spark');
    }
    return flags;
  }

  #resolveSkillCheck({
    character,
    context,
    flags,
    playerIntent,
    riskLevel,
  }: {
    character: NonNullable<GraphContext['chronicle']['character']>;
    context: GraphContext;
    flags: string[];
    playerIntent: NonNullable<GraphContext['playerIntent']>;
    riskLevel: RiskLevel;
  }): ReturnType<SkillCheckResolver['resolveRequest']> {
    const input: SkillCheckRequest = {
      attribute: playerIntent.attribute,
      character,
      checkId: randomUUID(),
      chronicleId: context.chronicleId,
      flags,
      metadata: {
        tags: [],
        timestamp: Date.now(),
      },
      riskLevel,
      skill: playerIntent.skill,
    };
    return new SkillCheckResolver(input).resolveRequest();
  }

  #normalizeString(value?: string | null): string | null {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    return null;
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

  #normalizeRationale(value?: string | string[] | null): string | null {
    if (typeof value === 'string') {
      return this.#normalizeString(value);
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        const normalized = this.#normalizeString(entry);
        if (normalized !== null) {
          return normalized;
        }
      }
    }
    return null;
  }
}

export { CheckPlannerNode };
