import {createHash, randomInt, randomUUID} from "node:crypto";
import {composeRulesContextPrompt} from "../../prompts.js";
import type {GraphContext} from "../../types.js";
import type {GraphNode} from "../orchestrator.js";
import {RISK_LEVEL_MAP, RiskLevel} from "@glass-frontier/dto";
import {ATTRIBUTES} from "@glass-frontier/dto/mechanics";
import {composeCheckRulesPrompt} from "../prompts/checkPlannerPrompt";
import {CheckRequestResolver} from "@glass-frontier/check-request-resolver";
import {CheckRequestInput} from "@glass-frontier/check-request-resolver/dist/src/CheckRequest";

function fallbackPlan() {
  return {
    riskLevel: RISK_LEVEL_MAP[randomInt(0, 4)],
    advantage: "none",
    rationale: ["You cant quite recall how to do that."],
    complicationSeeds: ["The universe disagrees with your intent."]

  }
}



class CheckPlannerNode implements GraphNode {
  readonly id = "check-planner";

  async execute(context: GraphContext): Promise<GraphContext> {
    if (!context.intent?.requiresCheck || context.safety?.escalate) {
      return { ...context, checkRequest: null };
    }
    const fallback = fallbackPlan();

    let parsed: Record<string, any> | null = null;

    const prompt = composeCheckRulesPrompt( context.intent, context.session);
    try {
      const result = await context.llm.generateJson({
        prompt,
        temperature: 0.25,
        maxTokens: 700,
        metadata: { nodeId: this.id, sessionId: context.sessionId }
      });
      parsed = result.json;
    } catch (error) {
      context.telemetry?.recordToolError?.({
        sessionId: context.sessionId,
        operation: "llm.check-planner",
        attempt: 0,
        message: error instanceof Error ? error.message : "unknown"
      });
    }

    const riskLevel = parsed?.riskLevel ?? fallback.riskLevel;
    const advantage = parsed?.advantage ?? fallback.advantage;
    const rationale = parsed?.rationale ?? fallback.rationale;
    const complicationSeeds = parsed?.riskLevel ?? fallback.riskLevel;
    const flags = []
    if (advantage != "none") {
      flags.push(advantage)
    }
    if (context?.intent.creativeSpark) {
      flags.push("creative-spark")
    }

    const input: CheckRequestInput = {
      flags: flags;
      attribute: context?.intent.attribute;
      skill: context?.intent.attribute;
      character: context?.session?.character;
      sessionId: context?.sessionId;
      riskLevel: riskLevel;
    }
    const resolver = new CheckRequestResolver(input);
    const checkResult = resolver.resolveRequest();

    const checkPlan: CheckPlan = {
      riskLevel,
      advantage,
      rationale,
      complicationSeeds
    }


    return {
      ...context,
      checkResult,
      checkPlan
    };
  }
}

export { CheckPlannerNode };
