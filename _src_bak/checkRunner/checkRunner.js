"use strict";

import { createHash  } from "crypto";
import { v4 as uuid  } from "uuid";
import { clamp  } from "../utils/math.js";
import { log  } from "../utils/logger.js";

const BLOCKING_SAFETY_FLAGS = new Set(["prohibited-capability", "content-warning"]);

function createNoopTelemetry() {
  return {
    recordCheckRun: () => {},
    recordCheckVeto: () => {},
    recordCheckError: () => {}
  };
}

class CheckRunner {
  constructor({ checkBus, sessionMemory, telemetry, randomizer } = {}) {
    if (!checkBus) {
      throw new Error("checkBus is required");
    }
    if (!sessionMemory) {
      throw new Error("sessionMemory is required");
    }

    this.checkBus = checkBus;
    this.sessionMemory = sessionMemory;
    this.telemetry = telemetry || createNoopTelemetry();
    this.randomizer = randomizer || defaultRandomizer;
  }

  start() {
    this.checkBus.onCheckRequest((envelope) => {
      setImmediate(() => this.handleCheckRequest(envelope));
    });
  }

  handleCheckRequest(envelope) {
    const startedAt = Date.now();

    try {
      const session = this.sessionMemory.getSessionState(envelope.sessionId);
      if (!session) {
        log("warn", "CheckRunner received request for unknown session", {
          sessionId: envelope.sessionId,
          checkId: envelope.id
        });
        return;
      }

      if (this.handleSafetyPath(session, envelope, startedAt)) {
        return;
      }

      const result = this.buildResolution(session, envelope, startedAt);
      const recorded = this.checkBus.emitCheckResolved(result);
      this.telemetry.recordCheckRun(recorded);
    } catch (error) {
      log("error", "CheckRunner failed to resolve check", {
        message: error.message,
        stack: error.stack,
        checkId: envelope.id,
        sessionId: envelope.sessionId
      });
      this.telemetry.recordCheckError(error, envelope);
    }
  }

  handleSafetyPath(session, envelope, startedAt) {
    const safetyFlags = envelope.data?.safetyFlags || [];
    const blockingReason = safetyFlags.find((flag) => BLOCKING_SAFETY_FLAGS.has(flag));

    if (!blockingReason) {
      return false;
    }

    const vetoPayload = {
      id: envelope.id,
      sessionId: envelope.sessionId,
      auditRef: envelope.auditRef,
      reason: blockingReason,
      safetyFlags,
      data: {
        move: envelope.data?.move,
        playerId: envelope.data?.playerId,
        message: "Check vetoed due to safety policy trigger.",
        occurredAt: new Date().toISOString()
      }
    };

    const vetoEnvelope = this.checkBus.emitCheckVetoed(vetoPayload);
    this.sessionMemory.recordCheckVeto(envelope.sessionId, vetoEnvelope);

    this.checkBus.emitAdminAlert({
      sessionId: envelope.sessionId,
      reason: blockingReason,
      severity: "high",
      data: {
        checkId: envelope.id,
        auditRef: envelope.auditRef,
        safetyFlags,
        latencyMs: Date.now() - startedAt
      }
    });

    this.telemetry.recordCheckVeto(vetoEnvelope);
    return true;
  }

  buildResolution(session, envelope, startedAt) {
    const momentumState = session.momentum || {
      current: 0,
      floor: -2,
      ceiling: 3,
      baseline: 0
    };

    const difficultyLabel = envelope.data?.difficulty || "standard";
    const difficultyTarget = envelope.data?.difficultyValue ?? mapDifficulty(difficultyLabel);
    const ability = envelope.data?.ability || envelope.data?.mechanics?.stat || "grit";
    const statValue =
      envelope.data?.mechanics?.statValue ?? session.character?.stats?.[ability] ?? 0;
    const pendingCheck = session.pendingChecks?.get(envelope.id);
    const flags = envelope.data?.flags || [];
    const safetyFlags = envelope.data?.safetyFlags || [];
    const momentumInput =
      typeof envelope.data?.momentum === "number" ? envelope.data.momentum : momentumState.current;
    const advantage = this.shouldApplyAdvantage(flags, momentumInput);
    const disadvantage = this.shouldApplyDisadvantage(flags, momentumInput);
    const bonusDice = Math.max(0, envelope.data?.mechanics?.bonusDice || 0);
    const dicePool = 2 + (advantage || disadvantage ? 1 : 0) + bonusDice;
    const sequence =
      pendingCheck && typeof pendingCheck.sequence === "number"
        ? pendingCheck.sequence
        : session.turnSequence || 0;
    const seed = buildSeed(session, envelope, difficultyTarget, statValue, sequence);
    const rawDice = this.randomizer(seed, dicePool);
    const { kept, discarded } = selectDice(rawDice, { advantage, disadvantage });
    const diceTotal = kept.reduce((sum, die) => sum + die, 0);
    const total = diceTotal + statValue;
    const margin = total - difficultyTarget;
    const tier = determineTier(margin, kept, advantage, disadvantage);
    const momentum = computeMomentum(momentumState, tier);
    const statAdjustments = computeStatAdjustments(tier, ability);
    const latency = Date.now() - startedAt;
    const rationale = buildRationale({
      tier,
      total,
      difficultyTarget,
      kept,
      statValue,
      flags,
      momentum
    });
    const complication = buildComplication(tier, envelope.data);

    return {
      id: envelope.id,
      sessionId: envelope.sessionId,
      auditRef: envelope.auditRef,
      topic: "event.checkResolved",
      tier,
      result: tier,
      outcome: tier,
      rationale,
      move: envelope.data?.move,
      tags: envelope.data?.tags || [],
      difficulty: {
        label: difficultyLabel,
        target: difficultyTarget
      },
      dice: {
        seed,
        rolls: rawDice,
        kept,
        discarded,
        advantageApplied: advantage && !disadvantage,
        disadvantageApplied: disadvantage && !advantage,
        bonusDice,
        statValue,
        total
      },
      flags,
      safetyFlags,
      momentum,
      momentumDelta: momentum.delta,
      momentumReset: tier === "hard-miss" ? momentumState.baseline ?? 0 : undefined,
      statAdjustments,
      complication,
      latencyMs: latency,
      telemetry: {
        latencyMs: latency,
        deterministicSeed: seed
      }
    };
  }

  shouldApplyAdvantage(flags, momentum) {
    const creativeSpark = flags.includes("creative-spark");
    return creativeSpark || momentum >= 2;
  }

  shouldApplyDisadvantage(flags, momentum) {
    const reckless = flags.includes("safety:reckless");
    const contentWarning = flags.includes("safety:content-warning");
    return reckless || contentWarning || momentum <= -2;
  }
}

function mapDifficulty(label) {
  switch (label) {
    case "controlled":
      return 7;
    case "standard":
      return 8;
    case "risky":
      return 9;
    case "desperate":
      return 10;
    default:
      return 8;
  }
}

function defaultRandomizer(seed, count) {
  const digest = createHash("sha256").update(seed).digest();
  const rolls = [];

  for (let i = 0; i < count; i += 1) {
    const byte = digest[i % digest.length];
    rolls.push((byte % 6) + 1);
  }

  return rolls;
}

function selectDice(rolls, { advantage, disadvantage }) {
  const effectiveAdvantage = advantage && !disadvantage;
  const effectiveDisadvantage = disadvantage && !advantage;
  const sorted = [...rolls].sort((a, b) =>
    effectiveDisadvantage ? a - b : b - a
  );
  const kept = sorted.slice(0, 2);
  const discarded = [];
  const remaining = [...rolls];

  kept.forEach((value) => {
    const index = remaining.indexOf(value);
    if (index >= 0) {
      remaining.splice(index, 1);
    }
  });

  discarded.push(...remaining);

  return { kept, discarded };
}

function determineTier(margin, keptDice, advantage, disadvantage) {
  const doubles = keptDice.length >= 2 && keptDice[0] === keptDice[1];
  const effectiveAdvantage = advantage && !disadvantage;

  if (margin >= 4 || (effectiveAdvantage && doubles)) {
    return "critical-success";
  }

  if (margin >= 0) {
    return "full-success";
  }

  if (margin >= -1) {
    return "partial-success";
  }

  if (margin >= -3) {
    return "fail-forward";
  }

  return "hard-miss";
}

function computeMomentum(momentumState, tier) {
  const before = momentumState?.current ?? 0;
  const floor = momentumState?.floor ?? -2;
  const ceiling = momentumState?.ceiling ?? 3;
  const baseline = momentumState?.baseline ?? 0;
  let delta = 0;
  let after = before;

  switch (tier) {
    case "critical-success":
      delta = 2;
      after = clamp(before + delta, floor, ceiling);
      break;
    case "full-success":
      delta = 1;
      after = clamp(before + delta, floor, ceiling);
      break;
    case "partial-success":
      delta = 0;
      after = before;
      break;
    case "fail-forward":
      delta = -1;
      after = clamp(before + delta, floor, ceiling);
      break;
    case "hard-miss":
      after = baseline;
      delta = after - before;
      break;
    default:
      after = before;
      delta = 0;
  }

  return {
    before,
    after,
    delta,
    reason: tier
  };
}

function computeStatAdjustments(tier, ability) {
  if (tier === "critical-success") {
    return [
      {
        stat: ability,
        delta: 1,
        reason: "critical-success surge"
      }
    ];
  }

  if (tier === "hard-miss") {
    return [
      {
        stat: ability,
        delta: -1,
        reason: "hard-miss setback"
      }
    ];
  }

  return [];
}

function buildRationale({ tier, total, difficultyTarget, kept, statValue, flags, momentum }) {
  const components = [
    `Total ${total} vs. target ${difficultyTarget}`,
    `Dice kept: ${kept.join(", ")}`,
    `Stat modifier: +${statValue}`
  ];

  if (momentum.delta !== 0) {
    components.push(`Momentum shift: ${momentum.delta >= 0 ? "+" : ""}${momentum.delta}`);
  }

  if (flags.includes("creative-spark")) {
    components.push("Rule-of-cool bonus applied");
  }

  return `${tier} — ${components.join(" | ")}`;
}

function buildComplication(tier, data = {}) {
  if (tier === "partial-success") {
    return {
      severity: "moderate",
      seed: data.rationale,
      tags: data.tags || []
    };
  }

  if (tier === "fail-forward") {
    return {
      severity: "high",
      seed: data.rationale,
      tags: (data.tags || []).concat(["fail-forward"])
    };
  }

  if (tier === "hard-miss") {
    return {
      severity: "critical",
      seed: data.rationale,
      tags: (data.tags || []).concat(["hard-miss"])
    };
  }

  return null;
}

function buildSeed(session, envelope, difficultyTarget, statValue, sequence) {
  return `${session.sessionId}:${envelope.id}:${sequence}:${difficultyTarget}:${statValue}`;
}

export {
  CheckRunner,
  defaultRandomizer,
  determineTier,
  computeMomentum
};
