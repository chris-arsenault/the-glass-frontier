"use strict";

const { v4: uuid } = require("uuid");

const DIFFICULTY_PRESETS = {
  controlled: 7,
  standard: 8,
  risky: 9,
  desperate: 10
};

const SAFETY_KEYWORDS = [
  { pattern: /\b(time\s?travel|rewrite\s+history)\b/i, flag: "prohibited-capability" },
  { pattern: /\b(mind\s?control|enslave)\b/i, flag: "prohibited-capability" },
  { pattern: /\b(mass\s+casualty|planetary\s+strike)\b/i, flag: "content-warning" }
];

const CREATIVE_SPARK_KEYWORDS = [/\bimprovise\b/i, /\bcallback\b/i, /\blore\b/i, /\brock opera\b/i];

function rulesRouterNode(context) {
  const { intent, session } = context;

  if (!intent || !intent.requiresCheck) {
    return { ...context, checkRequest: null };
  }

  const parameters = determineCheckParameters(intent, session);

  const checkRequest = {
    id: uuid(),
    auditRef: `audit-${uuid()}`,
    data: {
      intentId: uuid(),
      playerId: intent.playerId,
      sessionId: session.sessionId,
      move: parameters.move,
      difficulty: parameters.difficulty,
      difficultyValue: parameters.difficultyValue,
      ability: parameters.ability,
      momentum: parameters.momentum,
      rationale: parameters.rationale,
      flags: parameters.flags,
      safetyFlags: parameters.safetyFlags,
      mechanics: parameters.mechanics,
      tags: parameters.tags
    }
  };

  return {
    ...context,
    checkRequest
  };
}

function determineCheckParameters(intent, session) {
  const text = (intent.text || "").toLowerCase();
  const base = deriveMoveParameters(text);
  const momentumState = calculateMomentum(session);
  const safetyFlags = deriveSafetyFlags(text);
  const creativeSpark = detectCreativeSpark(text);
  const flags = new Set(base.flags);

  if (creativeSpark) {
    flags.add("creative-spark");
  }

  safetyFlags.forEach((flag) => flags.add(`safety:${flag}`));

  return {
    ...base,
    momentum: momentumState,
    safetyFlags,
    flags: Array.from(flags),
    mechanics: {
      baseDifficulty: base.difficultyValue,
      bonusDice: creativeSpark ? 1 : 0,
      stat: base.ability,
      statValue: session.character?.stats?.[base.ability] ?? 0
    }
  };
}

function deriveMoveParameters(text) {
  if (text.includes("sneak") || text.includes("quiet")) {
    return {
      move: "stealth",
      difficulty: "risky",
      difficultyValue: DIFFICULTY_PRESETS.risky,
      ability: "finesse",
      rationale: "Player attempts stealth maneuver in hazardous relay corridors.",
      flags: ["disclosure:stealth"],
      tags: ["delve-the-ruins", "risk-it-all"]
    };
  }

  if (text.includes("negotiate") || text.includes("talk")) {
    return {
      move: "diplomacy",
      difficulty: "standard",
      difficultyValue: DIFFICULTY_PRESETS.standard,
      ability: "presence",
      rationale: "Player initiates negotiation with local faction envoy.",
      flags: ["disclosure:social"],
      tags: ["sway-a-faction", "discern-the-truth"]
    };
  }

  if (text.includes("analyze") || text.includes("scan")) {
    return {
      move: "analysis",
      difficulty: "controlled",
      difficultyValue: DIFFICULTY_PRESETS.controlled,
      ability: "ingenuity",
      rationale: "Player analyzes systems to extract actionable intel.",
      flags: ["disclosure:analysis"],
      tags: ["discern-the-truth", "hack-the-signal"]
    };
  }

  const flags = ["disclosure:combat"];
  if (text.includes("reckless") || text.includes("all-out") || text.includes("charge")) {
    flags.push("safety:reckless");
  }

  return {
    move: "clash",
    difficulty: "desperate",
    difficultyValue: DIFFICULTY_PRESETS.desperate,
    ability: "grit",
    rationale: "Default contested move triggered by aggressive scene framing.",
    flags,
    tags: ["risk-it-all"]
  };
}

function calculateMomentum(session) {
  if (session?.momentum && typeof session.momentum.current === "number") {
    return session.momentum.current;
  }

  const history = session?.resolvedChecks || [];
  const base = 0;
  const bonus = history.slice(-3).filter((check) => check?.result === "full").length;
  return base + bonus;
}

function deriveSafetyFlags(text) {
  if (!text) {
    return [];
  }

  return SAFETY_KEYWORDS.filter((entry) => entry.pattern.test(text)).map((entry) => entry.flag);
}

function detectCreativeSpark(text) {
  if (!text) {
    return false;
  }

  return CREATIVE_SPARK_KEYWORDS.some((pattern) => pattern.test(text));
}

module.exports = {
  rulesRouterNode
};
