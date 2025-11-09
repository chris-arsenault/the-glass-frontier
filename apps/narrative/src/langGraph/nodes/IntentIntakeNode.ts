import type {GraphContext, Intent, SessionState} from "../../types.js";
import type { GraphNode } from "../orchestrator.js";
import { composeIntentPrompt } from "../../prompts.js";
import {Attribute, ATTRIBUTES} from "@glass-frontier/dto";
import {randomInt} from "node:crypto";

function fallbackIntent(text: string) {
  return {
    tone: "narrative",
    skill: "talk",
    requiresCheck: false,
    creativeSpark: false,
    attribute: ATTRIBUTES[randomInt(0, ATTRIBUTES.length)],
    intentSummary: text.slice(0, 120)
  };
}

class IntentIntakeNode implements GraphNode {
  readonly id = "intent-intake";

  existingSkillAttribute(session: SessionState, skill: string) {
    return session?.character?.skills[skill].attribute;
  }

  async execute(context: GraphContext): Promise<GraphContext> {
    const message = context.message ?? {};
    const text = (message.content ?? "").trim();
    const prompt = composeIntentPrompt({ session: context.session, playerMessage: text });
    const fallback = fallbackIntent(text);

    let parsed: Record<string, any> | null = null;

    try {
      const result = await context.llm.generateJson({
        prompt,
        temperature: 0.1,
        maxTokens: 500,
        metadata: { nodeId: this.id, sessionId: context.sessionId }
      });
      parsed = result.json;
    } catch (error) {
      context.telemetry?.recordToolError?.({
        sessionId: context.sessionId,
        operation: "llm.intent-intake",
        referenceId: null,
        attempt: 0,
        message: error instanceof Error ? error.message : "unknown"
      });
      return false;
    }

    const tone: string = parsed?.tone ?? fallback.tone;
    const requiresCheck: boolean = typeof parsed?.requiresCheck === "boolean" ? parsed.requiresCheck : fallback.requiresCheck;
    const creativeSpark: boolean = typeof parsed?.creativeSpark === "boolean" ? parsed.creativeSpark : fallback.creativeSpark;
    const skill: string = parsed.skill ?? fallback.skill;
    const attribute: Attribute = context.session?.character?.skills?.[skill].attribute ?? parsed?.attribute ?? fallback.attribute
    const intentSummary: string = parsed?.intentSummary ?? fallback.intentSummary

    const intent: Intent = {
      tone,
      requiresCheck,
      creativeSpark,
      skill,
      attribute,
      intentSummary
    };

    return {
      ...context,
      intent,
    };
  }
}

export { IntentIntakeNode };
