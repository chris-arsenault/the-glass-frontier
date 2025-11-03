"use strict";

const crypto = require("crypto");
const { v4: uuid } = require("uuid");
const { composeRulesContextPrompt } = require("../../prompts");

const DIFFICULTY_PRESETS = {
  controlled: { label: "controlled", value: 7 },
  standard: { label: "standard", value: 8 },
  risky: { label: "risky", value: 9 },
  desperate: { label: "desperate", value: 10 }
};

const MOVE_LIBRARY = {
  stealth: {
    move: "delve-the-ruins",
    tags: ["delve-the-ruins", "risk-it-all"],
    ability: "finesse",
    difficulty: DIFFICULTY_PRESETS.risky,
    rationale: "Navigating hostile corridors with limited visibility.",
    complicationSeeds: ["security_alert", "echoing_footfalls"]
  },
  diplomacy: {
    move: "sway-a-faction",
    tags: ["sway-a-faction", "discern-the-truth"],
    ability: "presence",
    difficulty: DIFFICULTY_PRESETS.standard,
    rationale: "Negotiation with cautious envoys in contested territory.",
    complicationSeeds: ["faction_misunderstanding", "hidden_agenda"]
  },
  analysis: {
    move: "hack-the-signal",
    tags: ["hack-the-signal", "discern-the-truth"],
    ability: "ingenuity",
    difficulty: DIFFICULTY_PRESETS.controlled,
    rationale: "Decoding signal lattice to extract actionable intel.",
    complicationSeeds: ["signal_feedback", "trace_routine"]
  },
  clash: {
    move: "risk-it-all",
    tags: ["risk-it-all"],
    ability: "grit",
    difficulty: DIFFICULTY_PRESETS.desperate,
    rationale: "Direct confrontation against entrenched opposition.",
    complicationSeeds: ["reinforcement_arrival", "equipment_stress"]
  }
};

function determineMovePlan(intent, session) {
  const text = (intent.text || "").toLowerCase();
  let base = MOVE_LIBRARY.clash;

  if (text.includes("sneak") || text.includes("quiet")) {
    base = MOVE_LIBRARY.stealth;
  } else if (text.includes("negotiate") || text.includes("talk") || text.includes("parley")) {
    base = MOVE_LIBRARY.diplomacy;
  } else if (text.includes("analyze") || text.includes("scan") || text.includes("hack")) {
    base = MOVE_LIBRARY.analysis;
  }

  const momentum = calculateMomentumState(session);
  const advantage = momentum >= 2 || intent.creativeSpark;
  const bonusDice = intent.creativeSpark ? 1 : 0;

  return {
    move: base.move,
    moveTags: base.tags,
    tags: base.tags,
    ability: intent.inferredAbility || base.ability,
    difficulty: base.difficulty.label,
    difficultyValue: base.difficulty.value,
    rationale: base.rationale,
    complicationSeeds: base.complicationSeeds,
    momentumState: momentum,
    advantage,
    bonusDice,
    recommendedNarration: [
      `Success: ${base.rationale} unfolds in the player's favor.`,
      `Complication: escalate via ${base.complicationSeeds[0]}`
    ].join(" ")
  };
}

function calculateMomentumState(session) {
  if (session?.momentum && typeof session.momentum.current === "number") {
    return session.momentum.current;
  }

  const history = session?.resolvedChecks || [];
  const base = 0;
  const bonus = history.slice(-3).filter((check) => check?.result === "full").length;
  return base + bonus;
}

function buildFlags(intent, safety) {
  const flags = new Set();
  (intent.moveTags || []).forEach((tag) => flags.add(`disclosure:${tag}`));
  if (intent.creativeSpark) {
    flags.add("creative-spark");
  }
  (safety?.flags || []).forEach((flag) => flags.add(`safety:${flag}`));
  return Array.from(flags);
}

function statForAbility(session, ability) {
  return session?.character?.stats?.[ability] ?? 0;
}

const checkPlannerNode = {
  id: "check-planner",
  execute(context) {
    if (!context.intent?.requiresCheck || context.safety?.escalate) {
      return {
        ...context,
        checkRequest: null
      };
    }

    const movePlan = determineMovePlan(context.intent, context.session);
    const auditRef = context.tools.generateAuditRef({
      sessionId: context.sessionId,
      component: "check",
      turnSequence: context.turnSequence
    });

    const prompt = composeRulesContextPrompt({
      session: context.session,
      intent: context.intent,
      safetyFlags: context.safety?.flags,
      movePlan
    });

    const promptHash = crypto.createHash("sha256").update(prompt).digest("hex");
    const expiresAt = new Date(Date.now() + 90 * 1000).toISOString();
    const flags = buildFlags(context.intent, context.safety);
    const statValue = statForAbility(context.session, movePlan.ability);

    const checkRequest = {
      id: uuid(),
      sessionId: context.sessionId,
      turnSequence: context.turnSequence,
      origin: "narrative-engine",
      auditRef,
      trigger: {
        detectedMove: movePlan.move,
        detectedMoveTags: movePlan.moveTags,
        playerUtterance: context.intent.text,
        momentum: movePlan.momentumState,
        narrativeTags: movePlan.tags,
        safetyFlags: context.safety?.flags || []
      },
      mechanics: {
        checkType: "2d6+stat",
        stat: movePlan.ability,
        difficulty: movePlan.difficulty,
        difficultyValue: movePlan.difficultyValue,
        advantage: movePlan.advantage,
        bonusDice: movePlan.bonusDice,
        complicationSeeds: movePlan.complicationSeeds
      },
      recommendedNarration: movePlan.recommendedNarration,
      expiresAt,
      metadata: {
        tone: context.intent.tone,
        promptHash,
        prompt,
        creativeSpark: context.intent.creativeSpark,
        safetyFlags: context.safety?.flags || []
      },
      data: {
        move: movePlan.move,
        tags: movePlan.tags,
        difficulty: movePlan.difficulty,
        difficultyValue: movePlan.difficultyValue,
        ability: movePlan.ability,
        momentum: movePlan.momentumState,
        flags,
        safetyFlags: context.safety?.flags || [],
        playerId: context.intent.playerId,
        mechanics: {
          stat: movePlan.ability,
          statValue,
          bonusDice: movePlan.bonusDice,
          difficulty: movePlan.difficulty,
          difficultyValue: movePlan.difficultyValue,
          momentum: movePlan.momentumState,
          advantage: movePlan.advantage
        }
      },
      flags
    };

    const promptPackets = [...(context.promptPackets || []), { type: "check-planner", prompt }];
    const auditTrail = [...(context.auditTrail || []), { nodeId: "check-planner", auditRef }];

    return {
      ...context,
      checkRequest,
      promptPackets,
      auditTrail,
      movePlan
    };
  }
};

module.exports = {
  checkPlannerNode
};
