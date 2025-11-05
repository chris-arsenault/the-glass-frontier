"use strict";

const DIFFICULTY_PRESETS = {
  controlled: { label: "controlled", value: 7 },
  standard: { label: "standard", value: 8 },
  risky: { label: "risky", value: 9 },
  desperate: { label: "desperate", value: 10 }
};

function detectTone(text) {
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

function detectMovePlan(text) {
  if (/\b(sneak|stealth|quiet|scout|delve)\b/i.test(text)) {
    return {
      move: "delve-the-ruins",
      tags: ["delve-the-ruins", "risk-it-all"],
      ability: "finesse",
      difficulty: DIFFICULTY_PRESETS.risky,
      complicationSeeds: ["security_alert", "echoing_footfalls"],
      rationale: "Navigating hostile corridors with limited visibility."
    };
  }

  if (/\b(negotiate|parley|talk|reason|convince)\b/i.test(text)) {
    return {
      move: "sway-a-faction",
      tags: ["sway-a-faction", "discern-the-truth"],
      ability: "presence",
      difficulty: DIFFICULTY_PRESETS.standard,
      complicationSeeds: ["faction_misunderstanding", "hidden_agenda"],
      rationale: "Negotiation with cautious envoys in contested territory."
    };
  }

  if (/\b(scan|analyze|override|decrypt|hack)\b/i.test(text)) {
    return {
      move: "hack-the-signal",
      tags: ["hack-the-signal", "discern-the-truth"],
      ability: "ingenuity",
      difficulty: DIFFICULTY_PRESETS.controlled,
      complicationSeeds: ["signal_feedback", "trace_routine"],
      rationale: "Decoding signal lattice to extract actionable intel."
    };
  }

  return {
    move: "risk-it-all",
    tags: ["risk-it-all"],
    ability: "grit",
    difficulty: DIFFICULTY_PRESETS.desperate,
    complicationSeeds: ["reinforcement_arrival", "equipment_stress"],
    rationale: "Direct confrontation against entrenched opposition."
  };
}

function createSceneGuidance(prompt) {
  const localeMatch = prompt.match(/Location: (.*?)(?: –|\n)/);
  const locale = localeMatch ? localeMatch[1] : "the frontier";
  return `Survey the situation at ${locale}, highlight the stakes, and invite the player forward.`;
}

function createIntentResponse(prompt) {
  const messageMatch = prompt.match(/Player Utterance: """([\s\S]*?)"""/);
  const utterance = messageMatch ? messageMatch[1] : "";
  const plan = detectMovePlan(utterance);
  const creativeSpark = /\b(improvise|callback|lore|rock opera)\b/i.test(utterance);
  const tone = detectTone(utterance);
  const requiresCheck = /\b(check|roll|test|risk|push|attempt)\b/i.test(utterance) || plan.move !== "risk-it-all";

  return {
    tone,
    moveTags: plan.tags,
    requiresCheck,
    ability: plan.ability,
    intentSummary: utterance.slice(0, 120),
    creativeSpark,
    safetyFlags: []
  };
}

function createCheckPlan(prompt) {
  const intentMatch = prompt.match(/Player Utterance: """([\s\S]*?)"""/);
  const utterance = intentMatch ? intentMatch[1] : "";
  const plan = detectMovePlan(utterance);
  return {
    move: plan.move,
    ability: plan.ability,
    difficulty: { ...plan.difficulty },
    advantage: /Momentum: [^0-9-]*([0-9-]+)/.test(prompt) && Number(RegExp.$1) >= 2,
    bonusDice: 0,
    complicationSeeds: plan.complicationSeeds,
    rationale: plan.rationale,
    recommendedNarration: {
      success: `${plan.rationale} unfolds in the player's favour.`,
      complication: `Complication surfaces via ${plan.complicationSeeds[0]}.`
    }
  };
}

function createOutcomeText(prompt) {
  if (prompt.includes("No mechanical check triggered")) {
    return "You steady the moment, narrating consequences without a roll. The frontier watches for your next move.";
  }
  const moveMatch = prompt.match(/Move: (.*)/);
  const difficultyMatch = prompt.match(/Difficulty: (.*)/);
  const abilityMatch = prompt.match(/Ability: (.*)/);
  const move = moveMatch ? moveMatch[1] : "the move";
  const difficulty = difficultyMatch ? difficultyMatch[1] : "standard";
  const ability = abilityMatch ? abilityMatch[1] : "presence";
  return `The fiction tightens as a ${move} check looms (${ability}, ${difficulty}). Outline the stakes and invite the roll.`;
}

function createStubLlmClient() {
  return {
    providerId: "stub-llm",
    async generateText({ prompt }) {
      const text = prompt.includes("## Narrative Outcome")
        ? createOutcomeText(prompt)
        : createSceneGuidance(prompt);
      return {
        text,
        raw: { content: text },
        usage: null,
        provider: "stub-llm",
        attempts: 1
      };
    },
    async generateJson({ prompt }) {
      const payload = prompt.includes("## Intent Intake")
        ? createIntentResponse(prompt)
        : createCheckPlan(prompt);
      return {
        json: payload,
        raw: payload,
        usage: null,
        provider: "stub-llm",
        attempts: 1
      };
    }
  };
}

module.exports = {
  createStubLlmClient
};
