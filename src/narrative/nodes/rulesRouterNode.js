"use strict";

const { v4: uuid } = require("uuid");

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
      ability: parameters.ability,
      momentum: parameters.momentum,
      rationale: parameters.rationale,
      flags: parameters.flags
    }
  };

  return {
    ...context,
    checkRequest
  };
}

function determineCheckParameters(intent, session) {
  const text = intent.text.toLowerCase();

  if (text.includes("sneak") || text.includes("quiet")) {
    return {
      move: "stealth",
      difficulty: "risky",
      ability: "finesse",
      momentum: calculateMomentum(session),
      rationale: "Player attempts stealth maneuver in hazardous relay corridors.",
      flags: ["disclosure:stealth"]
    };
  }

  if (text.includes("negotiate") || text.includes("talk")) {
    return {
      move: "diplomacy",
      difficulty: "standard",
      ability: "presence",
      momentum: calculateMomentum(session),
      rationale: "Player initiates negotiation with local faction envoy.",
      flags: ["disclosure:social"]
    };
  }

  return {
    move: "clash",
    difficulty: "desperate",
    ability: "grit",
    momentum: calculateMomentum(session),
    rationale: "Default contested move triggered by aggressive scene framing.",
    flags: ["disclosure:combat"]
  };
}

function calculateMomentum(session) {
  const history = session.resolvedChecks || [];
  const base = 2;
  const bonus = history.slice(-3).filter((check) => check?.result === "full").length;
  return base + bonus;
}

module.exports = {
  rulesRouterNode
};
