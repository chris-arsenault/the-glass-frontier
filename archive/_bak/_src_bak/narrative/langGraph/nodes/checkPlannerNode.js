"use strict";

import { randomUUID, createHash  } from "crypto";
import { composeRulesContextPrompt  } from "../../prompts.js";

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

function calculateMomentumState(session) {
  if (session?.momentum && typeof session.momentum.current === "number") {
    return session.momentum.current;
  }

  const history = session?.resolvedChecks || [];
  const base = 0;
  const bonus = history.slice(-3).filter((check) => check?.result === "full").length;
  return base + bonus;
}

function heuristicMovePlan(intent, session) {
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
    difficulty: base.difficulty,
    rationale: base.rationale,
    complicationSeeds: base.complicationSeeds,
    momentumState: momentum,
    advantage,
    bonusDice,
    recommendedNarration: {
      success: `${base.rationale} unfolds in the player's favour.`,
      complication: `Complication arises via ${base.complicationSeeds[0]}`
    }
  };
}

function normalizePlan(seedPlan, candidate) {
  if (!candidate) {
    return seedPlan;
  }

  const difficulty = candidate.difficulty || {};
  return {
    move: candidate.move || seedPlan.move,
    moveTags: Array.isArray(candidate.tags) && candidate.tags.length > 0 ? candidate.tags : seedPlan.moveTags,
    tags: Array.isArray(candidate.tags) && candidate.tags.length > 0 ? candidate.tags : seedPlan.tags,
    ability: candidate.ability || seedPlan.ability,
    difficulty: {
      label: difficulty.label || seedPlan.difficulty.label,
      value: typeof difficulty.value === "number" ? difficulty.value : seedPlan.difficulty.value
    },
    rationale: candidate.rationale || seedPlan.rationale,
    complicationSeeds: Array.isArray(candidate.complicationSeeds) && candidate.complicationSeeds.length > 0
      ? candidate.complicationSeeds
      : seedPlan.complicationSeeds,
    momentumState: typeof candidate.momentumState === "number" ? candidate.momentumState : seedPlan.momentumState,
    advantage:
      typeof candidate.advantage === "boolean" ? candidate.advantage : Boolean(seedPlan.advantage),
    bonusDice:
      typeof candidate.bonusDice === "number" ? candidate.bonusDice : seedPlan.bonusDice,
    recommendedNarration: {
      success: candidate?.recommendedNarration?.success || seedPlan.recommendedNarration.success,
      complication: candidate?.recommendedNarration?.complication || seedPlan.recommendedNarration.complication
    }
  };
}

function statForAbility(session, ability) {
  return session?.character?.stats?.[ability] ?? 0;
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

const checkPlannerNode = {
  id: "check-planner",
  async execute(context) {
    if (!context.intent?.requiresCheck || context.safety?.escalate) {
      return {
        ...context,
        checkRequest: null
      };
    }

    const heuristicPlan = heuristicMovePlan(context.intent, context.session);
    const auditRef = context.tools.generateAuditRef({
      sessionId: context.sessionId,
      component: "check",
      turnSequence: context.turnSequence
    });

    const prompt = composeRulesContextPrompt({
      session: context.session,
      intent: context.intent,
      safetyFlags: context.safety?.flags,
      movePlan: heuristicPlan
    });

    const promptPackets = [...(context.promptPackets || [])];
    let plan = heuristicPlan;

    if (context.llm?.generateJson) {
      try {
        const result = await context.llm.generateJson({
          prompt,
          temperature: 0.25,
          maxTokens: 700,
          metadata: { nodeId: "check-planner", sessionId: context.sessionId, auditRef }
        });
        plan = normalizePlan(heuristicPlan, result.json);

        promptPackets.push({
          type: "check-planner",
          prompt,
          provider: result.provider,
          response: result.raw || result.json || null,
          usage: result.usage || null
        });
      } catch (error) {
        if (typeof context.telemetry?.recordToolError === "function") {
          context.telemetry.recordToolError({
            sessionId: context.sessionId,
            operation: "llm.check-planner",
            referenceId: auditRef,
            attempt: 0,
            message: error.message
          });
        }
        promptPackets.push({
          type: "check-planner",
          prompt,
          error: error.message
        });
      }
    } else {
      promptPackets.push({
        type: "check-planner",
        prompt,
        provider: "llm-missing"
      });
    }

    const promptHash = createHash("sha256").update(prompt).digest("hex");
    const expiresAt = new Date(Date.now() + 90 * 1000).toISOString();
    const flags = buildFlags(context.intent, context.safety);
    const statValue = statForAbility(context.session, plan.ability);

    const checkRequest = {
      id: randomUUID(),
      sessionId: context.sessionId,
      turnSequence: context.turnSequence,
      origin: "narrative-engine",
      auditRef,
      trigger: {
        detectedMove: plan.move,
        detectedMoveTags: plan.moveTags,
        playerUtterance: context.intent.text,
        momentum: plan.momentumState,
        narrativeTags: plan.tags,
        safetyFlags: context.safety?.flags || []
      },
      mechanics: {
        checkType: "2d6+stat",
        stat: plan.ability,
        difficulty: plan.difficulty.label,
        difficultyValue: plan.difficulty.value,
        advantage: Boolean(plan.advantage),
        bonusDice: plan.bonusDice,
        complicationSeeds: plan.complicationSeeds
      },
      recommendedNarration: [
        plan.recommendedNarration?.success,
        plan.recommendedNarration?.complication
      ]
        .filter(Boolean)
        .join(" "),
      expiresAt,
      metadata: {
        tone: context.intent.tone,
        promptHash,
        prompt,
        creativeSpark: context.intent.creativeSpark,
        safetyFlags: context.safety?.flags || []
      },
      data: {
        move: plan.move,
        tags: plan.tags,
        difficulty: plan.difficulty.label,
        difficultyValue: plan.difficulty.value,
        ability: plan.ability,
        momentum: plan.momentumState,
        flags,
        safetyFlags: context.safety?.flags || [],
        playerId: context.intent.playerId,
        mechanics: {
          stat: plan.ability,
          statValue,
          bonusDice: plan.bonusDice,
          difficulty: plan.difficulty.label,
          difficultyValue: plan.difficulty.value,
          momentum: plan.momentumState,
          advantage: Boolean(plan.advantage)
        }
      },
      flags
    };

    const auditTrail = [...(context.auditTrail || []), { nodeId: "check-planner", auditRef }];

    return {
      ...context,
      checkRequest,
      promptPackets,
      auditTrail,
      movePlan: plan
    };
  }
};

export {
  checkPlannerNode
};
