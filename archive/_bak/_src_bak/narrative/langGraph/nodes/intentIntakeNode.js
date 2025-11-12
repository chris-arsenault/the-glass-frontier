"use strict";

import { composeIntentPrompt  } from "../../prompts.js";

const CHECK_SIGNAL_REGEX = /\b(check|roll|test|risk|push|attempt)\b/i;
const CREATIVE_SPARK_KEYWORDS = [/\bimprovise\b/i, /\bcallback\b/i, /\blore\b/i, /\brock opera\b/i];

const MOVE_MATCHERS = [
  {
    tags: ["delve-the-ruins", "risk-it-all"],
    requiresCheck: true,
    pattern: /\b(sneak|stealth|quiet|scout|delve)\b/i,
    ability: "finesse"
  },
  {
    tags: ["sway-a-faction", "discern-the-truth"],
    requiresCheck: true,
    pattern: /\b(negotiate|parley|talk|reason|convince)\b/i,
    ability: "presence"
  },
  {
    tags: ["hack-the-signal"],
    requiresCheck: true,
    pattern: /\b(scan|analyze|override|decrypt|hack)\b/i,
    ability: "ingenuity"
  },
  {
    tags: ["risk-it-all"],
    requiresCheck: true,
    pattern: /\b(attack|charge|strike|brawl|fight)\b/i,
    ability: "grit"
  }
];

function detectFallbackIntent(text) {
  const lower = text.toLowerCase();
  const match = MOVE_MATCHERS.find((entry) => entry.pattern.test(lower));
  const tone = (() => {
    if (/\b(attack|strike|charge|brawl)\b/i.test(text)) {
      return "aggressive";
    }
    if (/\b(sneak|slip|quietly|hide)\b/i.test(text)) {
      return "stealth";
    }
    if (/\b(parley|negotiate|talk|appeal)\b/i.test(text)) {
      return "diplomatic";
    }
    return "narrative";
  })();

  return {
    tone,
    moveTags: match ? match.tags : ["risk-it-all"],
    requiresCheck: CHECK_SIGNAL_REGEX.test(text) || Boolean(match?.requiresCheck),
    creativeSpark: CREATIVE_SPARK_KEYWORDS.some((pattern) => pattern.test(text)),
    ability: match?.ability || "grit",
    safetyFlags: [],
    intentSummary: text.slice(0, 120)
  };
}

const intentIntakeNode = {
  id: "intent-intake",
  async execute(context) {
    const message = context.message || {};
    const text = (message.content || "").trim();
    const prompt = composeIntentPrompt({ session: context.session, playerMessage: text });
    const promptPackets = [...(context.promptPackets || [])];
    const fallback = detectFallbackIntent(text);

    let parsed = null;

    if (context.llm?.generateJson) {
      try {
        const result = await context.llm.generateJson({
          prompt,
          temperature: 0.1,
          maxTokens: 500,
          metadata: { nodeId: "intent-intake", sessionId: context.sessionId }
        });
        parsed = result.json;
        promptPackets.push({
          type: "intent-intake",
          prompt,
          provider: result.provider,
          response: result.raw || result.json || null,
          usage: result.usage || null
        });
      } catch (error) {
        if (typeof context.telemetry?.recordToolError === "function") {
          context.telemetry.recordToolError({
            sessionId: context.sessionId,
            operation: "llm.intent-intake",
            referenceId: null,
            attempt: 0,
            message: error.message
          });
        }
        promptPackets.push({
          type: "intent-intake",
          prompt,
          error: error.message
        });
      }
    } else {
      promptPackets.push({
        type: "intent-intake",
        prompt,
        provider: "llm-missing"
      });
    }

    const moveTags = Array.isArray(parsed?.moveTags) && parsed.moveTags.length > 0 ? parsed.moveTags : fallback.moveTags;
    const intent = {
      playerId: message.playerId,
      sessionId: context.sessionId,
      text,
      tone: parsed?.tone || fallback.tone,
      moveTags,
      requiresCheck:
        typeof parsed?.requiresCheck === "boolean" ? parsed.requiresCheck : fallback.requiresCheck,
      creativeSpark:
        typeof parsed?.creativeSpark === "boolean" ? parsed.creativeSpark : fallback.creativeSpark,
      inferredAbility: parsed?.ability || fallback.ability,
      safetyFlags: Array.isArray(parsed?.safetyFlags) ? parsed.safetyFlags : fallback.safetyFlags,
      summary: parsed?.intentSummary || fallback.intentSummary
    };

    return {
      ...context,
      intent,
      promptPackets
    };
  }
};

export {
  intentIntakeNode
};
