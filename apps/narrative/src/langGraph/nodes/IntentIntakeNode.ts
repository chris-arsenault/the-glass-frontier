import type {GraphContext } from "../../types.js";
import type { GraphNode } from "../orchestrator.js";
import {Attribute, Intent} from "@glass-frontier/dto";
import {randomInt} from "node:crypto";
import { composeIntentPrompt } from "../prompts/prompts";

function fallbackIntent(text: string) {
  return {
    tone: "narrative",
    skill: "talk",
    requiresCheck: false,
    creativeSpark: false,
    attribute: Attribute.options[0],
    intentSummary: text.slice(0, 120)
  };
}

class IntentIntakeNode implements GraphNode {
  readonly id = "intent-intake";

  async execute(context: GraphContext): Promise<GraphContext> {
    if (context.failure) {
      context.telemetry?.recordToolNotRun({
        chronicleId: context.chronicleId,
        operation: "llm.intent-intake"
      });
      return {...context, failure: true}
    }
    const content: string = context.playerMessage.content ?? "";
    const prompt = await composeIntentPrompt({
      chronicle: context.chronicle,
      playerMessage: content,
      templates: context.templates
    });
    const fallback = fallbackIntent(content);

    let parsed: Record<string, any> | null = null;

    try {
      const result = await context.llm.generateJson({
        prompt,
        temperature: 0.1,
        maxTokens: 500,
        metadata: { nodeId: this.id, chronicleId: context.chronicleId }
      });
      parsed = result.json;
    } catch (error) {
      context.telemetry?.recordToolError?.({
        chronicleId: context.chronicleId,
        operation: "llm.intent-intake",
        referenceId: null,
        attempt: 0,
        message: error instanceof Error ? error.message : "unknown"
      });
      return {...context, failure: true}
    }

    const tone: string = parsed?.tone ?? fallback.tone;
    const requiresCheck: boolean = typeof parsed?.requiresCheck === "boolean" ? parsed.requiresCheck : fallback.requiresCheck;
    const creativeSpark: boolean = typeof parsed?.creativeSpark === "boolean" ? parsed.creativeSpark : fallback.creativeSpark;
    const skill: string = parsed.skill ?? fallback.skill;
    const attribute: Attribute = context.chronicle?.character?.skills?.[skill]?.attribute ?? parsed?.attribute ?? fallback.attribute
    const intentSummary: string = parsed?.intentSummary ?? fallback.intentSummary

    const playerIntent: Intent = {
      tone,
      skill,
      attribute,
      requiresCheck,
      creativeSpark,
      intentSummary,
      metadata: {
        timestamp: Date.now(),
        tags: []
      }
    };

    return {
      ...context,
      playerIntent,
    };
  }
}

export { IntentIntakeNode };
