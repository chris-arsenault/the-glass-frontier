"use strict";

const { composeIntentPrompt } = require("../../prompts");

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

function detectMovePlan(text) {
  for (const matcher of MOVE_MATCHERS) {
    if (matcher.pattern.test(text)) {
      return matcher;
    }
  }

  return {
    tags: ["risk-it-all"],
    requiresCheck: false,
    ability: "grit"
  };
}

function detectTone(text) {
  if (!text) {
    return "neutral";
  }

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
}

function detectCreativeSpark(text) {
  if (!text) {
    return false;
  }

  return CREATIVE_SPARK_KEYWORDS.some((pattern) => pattern.test(text));
}

const intentIntakeNode = {
  id: "intent-intake",
  execute(context) {
    const message = context.message || {};
    const text = (message.content || "").trim();
    const lower = text.toLowerCase();
    const movePlan = detectMovePlan(lower);
    const requiresCheck = CHECK_SIGNAL_REGEX.test(text) || movePlan.requiresCheck;

    const intent = {
      playerId: message.playerId,
      sessionId: context.sessionId,
      text,
      tone: detectTone(text),
      moveTags: movePlan.tags,
      requiresCheck,
      creativeSpark: detectCreativeSpark(text),
      inferredAbility: movePlan.ability
    };

    const prompt = composeIntentPrompt({ session: context.session, playerMessage: text });
    const promptPackets = [...(context.promptPackets || []), { type: "intent-intake", prompt }];

    return {
      ...context,
      intent,
      promptPackets
    };
  }
};

module.exports = {
  intentIntakeNode
};
