import { RiskLevel as RiskLevelSchema } from '@glass-frontier/dto';
import type { SkillCheckPlan, SkillCheckRequest, RiskLevel } from '@glass-frontier/dto';
import { SkillCheckResolver } from '@glass-frontier/skill-check-resolver';
import { randomUUID } from 'node:crypto';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import type { GraphContext } from '../../types.js';
import type { GraphNode, GraphNodeResult } from '../orchestrator.js';
import { composeCheckRulesPrompt } from '../prompts/prompts';

const PlannerPlanSchema = z.object({
  advantage: z
    .enum(['advantage', 'disadvantage', 'none'])
    .describe('Check framing: advantage, disadvantage, or none.'),
  complicationSeeds: z
    .array(
      z
        .string()
        .min(1)
        .describe('≤ 90 char hook showing what failure/partial success might introduce.')
    )
    .min(1)
    .describe('List of at least two complication hooks that may appear on failure.'),
  rationale: z
    .string()
    .min(1)
    .describe('One sentence explaining why this action requires a check.'),
  riskLevel: RiskLevelSchema.describe('Overall risk posture for this move.'),
});

const CHECK_PLANNER_FORMAT = zodTextFormat(PlannerPlanSchema, 'check_planner_response');
const CHECK_PLANNER_TEXT = {
  format: CHECK_PLANNER_FORMAT,
  verbosity: 'low' as const,
};

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

  async execute(context: GraphContext): Promise<GraphNodeResult> {
    if (context.failure) {
      this.#recordNotRun(context);
      return { ...context, failure: true };
    }

    const handlerTarget = this.#resolveHandlerForIntent(context);
    const nextTargets = this.#buildNextTargets(handlerTarget);
    if (!this.#isEligibleForPlanning(context)) {
      return {
        context: { ...context, skillCheckPlan: undefined, skillCheckResult: undefined },
        next: nextTargets,
      };
    }

    const planningOutcome = await this.#planSkillCheck(context);
    if (planningOutcome === null) {
      return { ...context, failure: true };
    }

    return {
      context: {
        ...context,
        ...planningOutcome,
      },
      next: nextTargets,
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
        reasoning: { effort: 'minimal' as const },
        temperature: 0.25,
        text: CHECK_PLANNER_TEXT,
      });
      const parsed = PlannerPlanSchema.safeParse(result.json);
      return parsed.success ? parsed.data : null;
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

  #shouldPlanCheck(context: GraphContext): boolean {
    const type = this.#resolveIntentType(context);
    if (type === 'action' || type === 'planning') {
      return context.playerIntent?.requiresCheck === true;
    }
    return false;
  }

  #resolveIntentType(context: GraphContext): NonNullable<GraphContext['resolvedIntentType']> {
    return context.resolvedIntentType ?? context.playerIntent?.intentType ?? 'action';
  }

  #resolveHandlerForIntent(context: GraphContext): string | undefined {
    const type = this.#resolveIntentType(context);
    if (type === 'inquiry') {
      return 'inquiry-responder';
    }
    if (type === 'clarification') {
      return 'clarification-responder';
    }
    if (type === 'possibility') {
      return 'possibility-advisor';
    }
    if (type === 'planning') {
      return 'planning-narrator';
    }
    if (type === 'reflection') {
      return 'reflection-weaver';
    }
    return 'action-resolver';
  }

  #buildNextTargets(handlerId?: string): string[] | undefined {
    return handlerId === undefined ? undefined : [handlerId];
  }

  #isEligibleForPlanning(context: GraphContext): boolean {
    return (
      context.playerIntent !== undefined &&
      context.chronicle.character !== undefined &&
      context.chronicle.character !== null &&
      this.#shouldPlanCheck(context)
    );
  }

  async #planSkillCheck(context: GraphContext): Promise<{
    skillCheckPlan: SkillCheckPlan;
    skillCheckResult: ReturnType<SkillCheckResolver['resolveRequest']>;
  } | null> {
    const prompt = await composeCheckRulesPrompt(
      context.playerIntent!,
      context.chronicle,
      context.templates
    );

    const overrides = await this.#requestPlan(context, prompt);
    if (overrides === null) {
      return null;
    }

    const plan = this.#mergePlan(overrides);
    const skillCheckPlan = this.#toSkillCheckPlan(plan);
    const flags = this.#buildFlags(context.playerIntent!, plan.advantage);
    const skillCheckResult = this.#resolveSkillCheck({
      character: context.chronicle.character!,
      context,
      flags,
      playerIntent: context.playerIntent!,
      riskLevel: plan.riskLevel,
    });
    return { skillCheckPlan, skillCheckResult };
  }
}

export { CheckPlannerNode };
