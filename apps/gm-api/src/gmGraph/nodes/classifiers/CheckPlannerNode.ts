import { Attribute, RiskLevel as RiskLevelSchema } from '@glass-frontier/dto';
import type { SkillCheckPlan } from '@glass-frontier/dto';
import { z } from 'zod';

import type { GraphContext } from '../../../types.js';
import type { GraphNodeDelta } from '../graphNode';
import { LlmClassifierNode } from './LlmClassiferNode';

const PlannerPlanSchema = z.object({
  advantage: z
    .enum(['advantage', 'disadvantage', 'none'])
    .describe('Situational edge for the check: advantage, disadvantage, or none.'),
  attribute: Attribute.describe('Attribute that best matches the player’s approach.'),
  requiresCheck: z
    .boolean()
    .describe('True when the move is meaningfully risky or contested and needs a roll.'),
  riskLevel: RiskLevelSchema.describe('Overall risk posture for this move.'),
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
      applyResult: (context, result) => this.#savePlan(context, result),
      id: 'check-planner',
      schema: PlannerPlanSchema,
      schemaName: 'check_planner_response',
      shouldRun: (context) => { return this.#isEligibleForPlanning(context); },
      telemetryTag: 'llm.check-planner'
    });
  }

  #isEligibleForPlanning(context: GraphContext): boolean {
    return (
      context.playerIntent !== undefined
      && this.#shouldPlanCheck(context)
    );
  }

  #shouldPlanCheck(context: GraphContext): boolean {
    const type = context.playerIntent?.intentType;
    return type === 'action' || type === 'planning' || type === 'wrap';
  }

  #savePlan(context: GraphContext, result: PlannerPlan): GraphNodeDelta {
    const skillCheckPlan: SkillCheckPlan = {
      advantage: result.advantage,
      attribute: result.attribute,
      creativeSpark: context.playerIntent?.creativeSpark ?? false,
      metadata: {
        tags: [],
        timestamp: Date.now(),
      },
      requiresCheck: result.requiresCheck,
      riskLevel: result.riskLevel,
      skill: result.skill,
    };
    return { skillCheckPlan };
  }
}

export { CheckPlannerNode };
