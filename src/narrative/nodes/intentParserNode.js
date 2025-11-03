"use strict";

const CHECK_SIGNAL_REGEX = /\b(check|roll|test)\b/i;

function intentParserNode(context) {
  const { message, session } = context;
  const trimmed = (message.content || "").trim();

  const intent = {
    playerId: message.playerId,
    sessionId: session.sessionId,
    text: trimmed,
    requiresCheck: CHECK_SIGNAL_REGEX.test(trimmed),
    inferredTone: inferTone(trimmed)
  };

  return {
    ...context,
    intent
  };
}

function inferTone(text) {
  if (!text) {
    return "neutral";
  }

  if (/\b(attack|strike|charge)\b/i.test(text)) {
    return "aggressive";
  }

  if (/\b(sneak|slip|quietly)\b/i.test(text)) {
    return "stealth";
  }

  if (/\b(parley|negotiate|talk)\b/i.test(text)) {
    return "diplomatic";
  }

  return "narrative";
}

module.exports = {
  intentParserNode
};
