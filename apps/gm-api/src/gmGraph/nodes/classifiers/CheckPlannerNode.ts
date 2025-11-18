import {Attribute, RiskLevel as RiskLevelSchema} from '@glass-frontier/dto';
import type { SkillCheckPlan } from '@glass-frontier/dto';
import { z } from 'zod';

import type { GraphContext } from '../../../types.js';
import {LlmClassifierNode} from "./LlmClassiferNode";

const PlannerPlanSchema = z.object({
  requiresCheck: z
    .boolean()
    .describe('True when the move is risky, contested, or otherwise requires a skill check.'),
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

type PlannerPlan = z.infer<typeof PlannerPlanSchema>;

class CheckPlannerNode extends LlmClassifierNode<PlannerPlan> {
  readonly id = 'check-planner';
  constructor() {
    super({
      id: 'check-planner',
      schema: PlannerPlanSchema,
      schemaName: 'check_planner_response',
      applyResult: (context, result) => this.#savePlan(context, result),
      shouldRun: (context) => { return this.#isEligibleForPlanning(context) },
      telemetryTag: 'llm.check-planner'
    })
  }

  #isEligibleForPlanning(context: GraphContext): boolean {
    return (
      context.playerIntent !== undefined &&
      context.chronicleState.character !== null &&
      this.#shouldPlanCheck(context)
    );
  }

  #shouldPlanCheck(context: GraphContext): boolean {
    const type = context.playerIntent?.intentType
    return type === 'action' || type === 'planning';
  }

  #savePlan(context: GraphContext, result: PlannerPlan): GraphContext {
    const skillCheckPlan: SkillCheckPlan = {
      advantage: result.advantage,
      complicationSeeds: result.complicationSeeds,
      metadata: {
        tags: [],
        timestamp: Date.now(),
      },
      rationale: result.rationale,
      riskLevel: result.riskLevel,
      attribute: result.attribute,
      skill: result.skill,
      requiresCheck: result.requiresCheck,
      creativeSpark: context.playerIntent?.creativeSpark || false,
    };
    return {
      ...context,
      skillCheckPlan: skillCheckPlan,
    };
  }
}

export { CheckPlannerNode };
