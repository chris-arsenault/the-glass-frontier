import type { SkillCheckPlan, SkillCheckRequest, RiskLevel } from '@glass-frontier/dto';
import { SkillCheckResolver } from '@glass-frontier/skill-check-resolver';
import { randomUUID } from 'node:crypto';

import type { GraphContext } from '../../types.js';
import type { GraphNode } from '../orchestrator.js';
import { composeCheckRulesPrompt } from '../prompts/prompts';

function fallbackPlan() {
  return {
    advantage: 'none',
    complicationSeeds: ['The universe disagrees with your intent.'],
    rationale: ['You cant quite recall how to do that.'],
    riskLevel: 'standard',
  };
}

class CheckPlannerNode implements GraphNode {
  readonly id = 'check-planner';

  async execute(context: GraphContext): Promise<GraphContext> {
    if (context.failure) {
      context.telemetry?.recordToolNotRun({
        chronicleId: context.chronicleId,
        operation: 'llm.check-planner',
      });
      return { ...context, failure: true };
    }
    if (
      !context.playerIntent ||
      !context.playerIntent?.requiresCheck ||
      !context.chronicle.character
    ) {
      return { ...context, skillCheckResult: undefined };
    }
    const fallback = fallbackPlan();

    let parsed: Record<string, any> | null = null;

    const prompt = await composeCheckRulesPrompt(
      context.playerIntent,
      context.chronicle,
      context.templates
    );
    try {
      const result = await context.llm.generateJson({
        maxTokens: 700,
        metadata: { chronicleId: context.chronicleId, nodeId: this.id },
        prompt,
        temperature: 0.25,
      });
      parsed = result.json;
    } catch (error) {
      context.telemetry?.recordToolError?.({
        attempt: 0,
        chronicleId: context.chronicleId,
        message: error instanceof Error ? error.message : 'unknown',
        operation: 'llm.check-planner',
      });
      return { ...context, failure: true };
    }

    const riskLevel: RiskLevel = parsed?.riskLevel ?? fallback.riskLevel;
    const advantage: string = parsed?.advantage ?? fallback.advantage;
    const rationale: string = parsed?.rationale ?? fallback.rationale;
    const complicationSeeds: string[] = parsed?.complicationSeeds ?? fallback.complicationSeeds;
    const flags: string[] = [];
    if (advantage != 'none') {
      flags.push(advantage);
    }
    if (context?.playerIntent.creativeSpark) {
      flags.push('creative-spark');
    }

    const skillCheckPlan: SkillCheckPlan = {
      advantage,
      complicationSeeds,
      metadata: {
        tags: [],
        timestamp: Date.now(),
      },
      rationale,
      riskLevel,
    };

    const input: SkillCheckRequest = {
      attribute: context.playerIntent.attribute,
      character: context.chronicle.character,
      checkId: randomUUID(),
      chronicleId: context.chronicleId,
      flags: flags,
      metadata: {
        tags: [],
        timestamp: Date.now(),
      },
      riskLevel: riskLevel,
      skill: context.playerIntent.skill,
    };

    const resolver = new SkillCheckResolver(input);
    const skillCheckResult = resolver.resolveRequest();

    return {
      ...context,
      skillCheckPlan,
      skillCheckResult,
    };
  }
}

export { CheckPlannerNode };
