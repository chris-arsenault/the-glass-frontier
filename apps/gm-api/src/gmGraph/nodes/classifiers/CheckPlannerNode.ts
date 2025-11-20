import {Attribute, RiskLevel as RiskLevelSchema} from '@glass-frontier/dto';
import type { SkillCheckPlan } from '@glass-frontier/dto';
import { z } from 'zod';

import type { GraphContext } from '../../../types.js';
import {LlmClassifierNode} from "./LlmClassiferNode";

const PlannerPlanSchema = z.object({
  requiresCheck: z
    .boolean()
    .describe('True when the move is meaningfully risky or contested and needs a roll.'),
  advantage: z
    .enum(['advantage', 'disadvantage', 'none'])
    .describe('Situational edge for the check: advantage, disadvantage, or none.'),
  complicationSeeds: z
    .array(
      z
        .string()
        .min(1)
        .describe('≤ 90 char hook for how failure or a mixed result complicates things.')
    )
    .min(0)
    .describe('2–3 complication hooks when requiresCheck=true; otherwise an empty array.'),
  riskLevel: RiskLevelSchema.describe('Overall risk posture for this move.'),
  attribute: Attribute.describe('Attribute that best matches the player’s approach.'),
  skill: z
    .string()
    .min(1)
    .describe('Best-fit skill name, preferring existing skills; new labels ≤ 2 words.'),
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
    return type === 'action' || type === 'planning' || type === 'wrap';
  }

  #savePlan(context: GraphContext, result: PlannerPlan): GraphContext {
    const skillCheckPlan: SkillCheckPlan = {
      advantage: result.advantage,
      complicationSeeds: result.complicationSeeds,
      metadata: {
        tags: [],
        timestamp: Date.now(),
      },
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
