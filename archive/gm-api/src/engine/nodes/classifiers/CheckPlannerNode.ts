import type { SkillCheckPlan } from '@glass-frontier/worldstate';
import { z } from 'zod';

import { composeCheckPlannerPrompt } from '../../prompts';
import type { StructuredLlmClient } from '../structuredLlmClient';
import { LlmClassifierNode } from './LlmClassifierNode';

const CheckPlannerResultSchema = z.object({
  advantage: z.enum(['advantage', 'disadvantage', 'none']).default('none'),
  complicationSeeds: z.array(z.string().min(1)).min(1).max(4),
  rationale: z.string().min(1),
  riskLevel: z.enum(['controlled', 'standard', 'risky', 'desperate']).default('standard'),
});

type CheckPlannerResult = z.infer<typeof CheckPlannerResultSchema>;

export class CheckPlannerNode extends LlmClassifierNode<CheckPlannerResult> {
  constructor(client: StructuredLlmClient) {
    super(client, {
      applyResult: (context, result) => {
        const plan: SkillCheckPlan = {
          advantage: result.advantage,
          complicationSeeds: result.complicationSeeds,
          metadata: {
            source: 'check-planner',
            timestamp: Date.now(),
          },
          rationale: result.rationale,
          riskLevel: result.riskLevel,
        };
        return {
          ...context,
          turnDraft: {
            ...context.turnDraft,
            skillCheckPlan: plan,
          },
        };
      },
      buildPrompt: (context) =>
        composeCheckPlannerPrompt({
          character: context.character,
          chronicle: context.chronicle,
          intent: context.turnDraft.playerIntent,
        }),
      id: 'check-planner',
      schema: CheckPlannerResultSchema,
      telemetryTag: 'llm.check-planner',
    });
  }
}
