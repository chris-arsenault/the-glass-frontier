import { randomUUID } from "node:crypto";
import type { GraphContext } from "../../types.js";
import type { GraphNode } from "../orchestrator.js";
import { composeCheckRulesPrompt } from "../prompts/prompts";
import { SkillCheckResolver } from "@glass-frontier/skill-check-resolver";
import {
  SkillCheckPlan,
  SkillCheckRequest,
  RiskLevel,
} from "@glass-frontier/dto";

function fallbackPlan() {
  return {
    riskLevel: 'standard',
    advantage: "none",
    rationale: ["You cant quite recall how to do that."],
    complicationSeeds: ["The universe disagrees with your intent."]
  }
}

class CheckPlannerNode implements GraphNode {
  readonly id = "check-planner";

  async execute(context: GraphContext): Promise<GraphContext> {
    if (context.failure) {
      context.telemetry?.recordToolNotRun({
        chronicleId: context.chronicleId,
        operation: "llm.check-planner"
      });
      return {...context, failure: true}
    }
    if (!context.playerIntent || !context.playerIntent?.requiresCheck || !context.chronicle.character) {
      return { ...context, skillCheckResult: undefined };
    }
    const fallback = fallbackPlan();

    let parsed: Record<string, any> | null = null;

    const prompt = composeCheckRulesPrompt(context.playerIntent, context.chronicle);
    try {
      const result = await context.llm.generateJson({
        prompt,
        temperature: 0.25,
        maxTokens: 700,
        metadata: { nodeId: this.id, chronicleId: context.chronicleId }
      });
      parsed = result.json;
    } catch (error) {
      context.telemetry?.recordToolError?.({
        chronicleId: context.chronicleId,
        operation: "llm.check-planner",
        attempt: 0,
        message: error instanceof Error ? error.message : "unknown"
      });
      return {...context, failure: true}
    }

    const riskLevel: RiskLevel = parsed?.riskLevel ?? fallback.riskLevel;
    const advantage: string = parsed?.advantage ?? fallback.advantage;
    const rationale: string = parsed?.rationale ?? fallback.rationale;
    const complicationSeeds: string[] = parsed?.complicationSeeds ?? fallback.complicationSeeds;
    const flags: string[] = []
    if (advantage != "none") {
      flags.push(advantage)
    }
    if (context?.playerIntent.creativeSpark) {
      flags.push("creative-spark")
    }

    const skillCheckPlan: SkillCheckPlan = {
      riskLevel,
      advantage,
      rationale,
      complicationSeeds,
      metadata: {
        timestamp: Date.now(),
        tags: []
      }
    }

    const input: SkillCheckRequest = {
      chronicleId: context.chronicleId,
      checkId: randomUUID(),
      flags: flags,
      attribute: context.playerIntent.attribute,
      skill: context.playerIntent.skill,
      character: context.chronicle.character,
      riskLevel: riskLevel,
      metadata: {
        timestamp: Date.now(),
        tags: []
      }
    }

    const resolver = new SkillCheckResolver(input);
    const skillCheckResult = resolver.resolveRequest();

    return {
      ...context,
      skillCheckPlan,
      skillCheckResult
    };
  }
}

export { CheckPlannerNode };
