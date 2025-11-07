#!/usr/bin/env node
"use strict";

process.env.LOG_LEVEL = process.env.LOG_LEVEL || "warn";

import { performance  } from "node:perf_hooks.js";
import { createHash  } from "crypto.js";
import { CheckBus  } from "../../_src_bak/events/checkBus.js";
import { SessionMemoryFacade  } from "../../_src_bak/memory/sessionMemory.js";
import { CheckRunner  } from "../../_src_bak/checkRunner/checkRunner.js";
import { CheckMetrics  } from "../../_src_bak/telemetry/checkMetrics.js";

const DEFAULT_CONFIG = {
  sessions: 60,
  checksPerSession: 30,
  minDelayMs: 10,
  maxDelayMs: 80,
  latencyBudgetMs: 1500,
  json: false,
  scenario: "baseline"
};

const NUMERIC_KEYS = new Set([
  "sessions",
  "checksPerSession",
  "minDelayMs",
  "maxDelayMs",
  "latencyBudgetMs"
]);

const ABILITIES = ["ingenuity", "resolve", "finesse", "presence", "weird", "grit"];
const MOVE_TAGS = [
  "risk-it-all",
  "sway-a-faction",
  "delve-the-ruins",
  "hack-the-signal",
  "fortify-the-hub",
  "mend-the-broken",
  "discern-the-truth",
  "channel-the-veil"
];

function parseArgs(argv) {
  const config = { ...DEFAULT_CONFIG };

  for (let index = 2; index < argv.length; index += 1) {
    const raw = argv[index];

    if (!raw.startsWith("--")) {
      continue;
    }

    const [rawKey, inlineValue] = raw.split("=");
    const normalizedKey = rawKey
      .slice(2)
      .replace(/-([a-z])/g, (_match, char) => char.toUpperCase());

    let value = inlineValue;

    if (value === undefined) {
      const next = argv[index + 1];
      if (next && !next.startsWith("--")) {
        value = next;
        index += 1;
      }
    }

    if (value === undefined) {
      value = "true";
    }

    if (NUMERIC_KEYS.has(normalizedKey)) {
      config[normalizedKey] = Number(value);
      continue;
    }

    if (normalizedKey === "json") {
      config.json = value === "true";
      continue;
    }

    if (normalizedKey === "scenario") {
      config.scenario = String(value);
      continue;
    }

    throw new Error(`Unknown argument: ${rawKey}`);
  }

  if (Number.isNaN(config.sessions) || config.sessions <= 0) {
    throw new Error("sessions must be a positive number");
  }

  if (Number.isNaN(config.checksPerSession) || config.checksPerSession <= 0) {
    throw new Error("checksPerSession must be a positive number");
  }

  if (config.minDelayMs < 0 || config.maxDelayMs < config.minDelayMs) {
    throw new Error("Delay configuration must satisfy 0 <= minDelayMs <= maxDelayMs");
  }

  return config;
}

const UINT32_MAX = 0xffffffff;

function seededRandom(sessionId, index, salt) {
  const hash = createHash("sha256").update(`${sessionId}:${index}:${salt}`).digest("hex");
  const intValue = parseInt(hash.slice(0, 8), 16);
  return intValue / UINT32_MAX;
}

function selectAbility(sessionId, checkIndex) {
  const roll = seededRandom(sessionId, checkIndex, "ability");
  const idx = Math.floor(roll * ABILITIES.length) % ABILITIES.length;
  return ABILITIES[idx];
}

function selectMoveTags(sessionId, checkIndex) {
  const roll = seededRandom(sessionId, checkIndex, "move");
  const primaryIndex = Math.floor(roll * MOVE_TAGS.length) % MOVE_TAGS.length;
  const tags = [MOVE_TAGS[primaryIndex]];

  const secondaryRoll = seededRandom(sessionId, checkIndex, "move-secondary");

  if (secondaryRoll > 0.75) {
    const secondaryIndex =
      (primaryIndex + Math.floor(secondaryRoll * MOVE_TAGS.length)) % MOVE_TAGS.length;
    if (secondaryIndex !== primaryIndex) {
      tags.push(MOVE_TAGS[secondaryIndex]);
    }
  }

  return tags;
}

function selectDifficulty(sessionId, checkIndex) {
  const baseline = 7;
  const spread = 6;
  const modifier = Math.round(seededRandom(sessionId, checkIndex, "difficulty") * spread) - 2;
  const value = Math.max(4, baseline + modifier);

  if (value >= 11) {
    return { label: "epic", value };
  }

  if (value >= 9) {
    return { label: "challenging", value };
  }

  if (value <= 6) {
    return { label: "standard", value };
  }

  return { label: "risky", value };
}

function selectMomentum(sessionId, checkIndex) {
  const roll = seededRandom(sessionId, checkIndex, "momentum");
  return Math.round(roll * 4) - 2;
}

function selectFlags(sessionId, checkIndex) {
  const flags = [];
  if (seededRandom(sessionId, checkIndex, "creative") > 0.82) {
    flags.push("creative-spark");
  }

  if (seededRandom(sessionId, checkIndex, "reckless") > 0.9) {
    flags.push("reckless");
  }

  return flags;
}

function selectSafetyFlags(sessionId, checkIndex) {
  const flags = [];
  const safetyRoll = seededRandom(sessionId, checkIndex, "safety");

  if (safetyRoll > 0.99) {
    flags.push("prohibited-capability");
  } else if (safetyRoll > 0.97) {
    flags.push("content-warning");
  }

  return flags;
}

function selectBonusDice(sessionId, checkIndex) {
  const roll = seededRandom(sessionId, checkIndex, "bonus");
  if (roll > 0.92) {
    return 2;
  }

  if (roll > 0.8) {
    return 1;
  }

  return 0;
}

function selectStatValue(sessionId, checkIndex) {
  const roll = seededRandom(sessionId, checkIndex, "stat");
  return Math.max(0, Math.round(roll * 3));
}

function createCheckPayload(sessionId, checkIndex) {
  const ability = selectAbility(sessionId, checkIndex);
  const { label: difficulty, value: difficultyValue } = selectDifficulty(sessionId, checkIndex);
  const flags = selectFlags(sessionId, checkIndex);
  const safetyFlags = selectSafetyFlags(sessionId, checkIndex);
  const momentum = selectMomentum(sessionId, checkIndex);
  const bonusDice = selectBonusDice(sessionId, checkIndex);
  const statValue = selectStatValue(sessionId, checkIndex) + bonusDice;

  return {
    data: {
      playerId: `player-${sessionId}`,
      sessionId,
      move: `move-${checkIndex % 5}`,
      ability,
      difficulty,
      difficultyValue,
      momentum,
      rationale: `Benchmark scenario for ${ability} vs ${difficulty}`,
      flags,
      safetyFlags,
      mechanics: {
        statValue,
        bonusDice,
        stat: ability
      },
      tags: selectMoveTags(sessionId, checkIndex)
    }
  };
}

function delay(ms) {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

class BenchmarkMetrics {
  constructor(totalRequests, latencyBudgetMs) {
    this.totalRequests = totalRequests;
    this.latencyBudgetMs = latencyBudgetMs;
    this.resolvedLatencies = [];
    this.vetoLatencies = [];
    this.inFlight = 0;
    this.maxInFlight = 0;
    this.queueDepthSamples = [];
    this.startTimes = new Map();
    this.outcomeCounts = {
      resolved: 0,
      vetoed: 0
    };
    this.firstDispatchAt = null;
    this.lastResolutionAt = null;
    this.tierCounts = {};
    this._resolveDone = null;
    this.done = new Promise((resolve) => {
      this._resolveDone = resolve;
    });
  }

  recordQueueDepth(now) {
    this.queueDepthSamples.push({
      timestamp: now,
      depth: this.inFlight
    });
  }

  handleDispatch(envelope) {
    const now = performance.now();
    if (this.firstDispatchAt === null) {
      this.firstDispatchAt = now;
    }

    this.startTimes.set(envelope.id, now);
    this.inFlight += 1;
    if (this.inFlight > this.maxInFlight) {
      this.maxInFlight = this.inFlight;
    }
    this.recordQueueDepth(now);
  }

  handleResolved(envelope) {
    const now = performance.now();
    const start = this.startTimes.get(envelope.id);
    this.startTimes.delete(envelope.id);

    if (start !== undefined) {
      this.resolvedLatencies.push(now - start);
    }

    this.inFlight = Math.max(0, this.inFlight - 1);
    this.outcomeCounts.resolved += 1;
    this.lastResolutionAt = now;
    if (envelope.tier) {
      this.tierCounts[envelope.tier] = (this.tierCounts[envelope.tier] || 0) + 1;
    }
    this.recordQueueDepth(now);
    this._maybeResolve();
  }

  handleVeto(envelope) {
    const now = performance.now();
    const start = this.startTimes.get(envelope.id);
    this.startTimes.delete(envelope.id);

    if (start !== undefined) {
      this.vetoLatencies.push(now - start);
    }

    this.inFlight = Math.max(0, this.inFlight - 1);
    this.outcomeCounts.vetoed += 1;
    this.lastResolutionAt = now;
    this.recordQueueDepth(now);
    this._maybeResolve();
  }

  _maybeResolve() {
    if (this.outcomeCounts.resolved + this.outcomeCounts.vetoed >= this.totalRequests) {
      this._resolveDone();
    }
  }

  async waitForCompletion() {
    await this.done;
  }

  buildSummary() {
    const totalDurationMs =
      this.firstDispatchAt && this.lastResolutionAt
        ? this.lastResolutionAt - this.firstDispatchAt
        : 0;

    return {
      totalRequests: this.totalRequests,
      outcomes: { ...this.outcomeCounts },
      latency: buildLatencySummary(this.resolvedLatencies),
      vetoLatency: buildLatencySummary(this.vetoLatencies),
      latencyBudgetMs: this.latencyBudgetMs,
      violations: this.resolvedLatencies.filter((value) => value > this.latencyBudgetMs).length,
      queueDepth: buildQueueDepthSummary(this.queueDepthSamples, this.maxInFlight),
      durationMs: totalDurationMs,
      throughputPerSecond:
        totalDurationMs > 0 ? (this.totalRequests / (totalDurationMs / 1000)).toFixed(2) : "n/a",
      tierCounts: this.tierCounts
    };
  }
}

function buildLatencySummary(values) {
  if (!values || values.length === 0) {
    return {
      count: 0,
      min: 0,
      max: 0,
      mean: 0,
      p50: 0,
      p90: 0,
      p95: 0,
      p99: 0
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, value) => acc + value, 0);

  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: sum / sorted.length,
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99)
  };
}

function buildQueueDepthSummary(samples, maxInFlight) {
  if (!samples || samples.length === 0) {
    return {
      max: 0,
      average: 0
    };
  }

  const total = samples.reduce((acc, sample) => acc + sample.depth, 0);
  const average = total / samples.length;

  return {
    max: maxInFlight,
    average
  };
}

function percentile(sortedValues, percentileRank) {
  if (sortedValues.length === 0) {
    return 0;
  }

  const index = Math.min(
    sortedValues.length - 1,
    Math.ceil((percentileRank / 100) * sortedValues.length) - 1
  );
  return sortedValues[index];
}

async function runScenario(config) {
  const sessionMemory = new SessionMemoryFacade();
  const checkBus = new CheckBus();
  const metrics = new BenchmarkMetrics(
    config.sessions * config.checksPerSession,
    config.latencyBudgetMs
  );
  const checkRunner = new CheckRunner({
    checkBus,
    sessionMemory,
    telemetry: new CheckMetrics()
  });

  checkBus.onCheckResolved((envelope) => {
    sessionMemory.recordCheckResolution(envelope.sessionId, envelope);
    metrics.handleResolved(envelope);
  });

  checkBus.onCheckVetoed((envelope) => {
    metrics.handleVeto(envelope);
  });

  checkRunner.start();

  const sessionIds = Array.from({ length: config.sessions }, (_, idx) => `session-${idx + 1}`);
  sessionIds.forEach((sessionId) => sessionMemory.ensureSession(sessionId));

  async function simulateSession(sessionId) {
    for (let checkIndex = 0; checkIndex < config.checksPerSession; checkIndex += 1) {
      const baseDelayRoll = seededRandom(sessionId, checkIndex, "delay");
      const span = config.maxDelayMs - config.minDelayMs;
      const delayMs = config.minDelayMs + Math.round(baseDelayRoll * span);
      await delay(delayMs);
      const payload = createCheckPayload(sessionId, checkIndex);
      const envelope = checkBus.emitCheckRequest(sessionId, payload);
      sessionMemory.recordCheckRequest(sessionId, envelope);
      metrics.handleDispatch(envelope);
    }
  }

  await Promise.all([Promise.all(sessionIds.map(simulateSession)), metrics.waitForCompletion()]);

  return metrics.buildSummary();
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "n/a";
}

function printSummary(summary, config) {
  if (config.json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ config, summary }, null, 2));
    return;
  }

  // eslint-disable-next-line no-console
  console.log("=== Check Runner Benchmark Summary ===");
  // eslint-disable-next-line no-console
  console.log(`Sessions: ${config.sessions}`);
  // eslint-disable-next-line no-console
  console.log(`Checks per session: ${config.checksPerSession}`);
  // eslint-disable-next-line no-console
  console.log(`Total requests: ${summary.totalRequests}`);
  // eslint-disable-next-line no-console
  console.log(`Resolved: ${summary.outcomes.resolved}, Vetoed: ${summary.outcomes.vetoed}`);
  // eslint-disable-next-line no-console
  console.log(`Total duration (ms): ${formatNumber(summary.durationMs)}`);
  // eslint-disable-next-line no-console
  console.log(`Throughput (req/s): ${summary.throughputPerSecond}`);
  // eslint-disable-next-line no-console
  console.log(
    `Latency ms (count=${summary.latency.count}): min=${formatNumber(summary.latency.min)}, p50=${formatNumber(summary.latency.p50)}, p95=${formatNumber(summary.latency.p95)}, p99=${formatNumber(summary.latency.p99)}, max=${formatNumber(summary.latency.max)}`
  );
  // eslint-disable-next-line no-console
  console.log(
    `Latency budget violations (> ${summary.latencyBudgetMs}ms): ${summary.violations}`
  );
  // eslint-disable-next-line no-console
  console.log(
    `Queue depth: max=${formatNumber(summary.queueDepth.max)}, average=${formatNumber(
      summary.queueDepth.average
    )}`
  );
  // eslint-disable-next-line no-console
  console.log("Tier distribution:", summary.tierCounts);
  if (summary.vetoLatency.count > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `Veto latency ms (count=${summary.vetoLatency.count}): min=${formatNumber(
        summary.vetoLatency.min
      )}, p95=${formatNumber(summary.vetoLatency.p95)}, max=${formatNumber(summary.vetoLatency.max)}`
    );
  }
}

async function main() {
  const config = parseArgs(process.argv);
  const summary = await runScenario(config);
  printSummary(summary, config);

  if (summary.violations > 0 && !config.json) {
    // eslint-disable-next-line no-console
    console.warn(
      `Latency budget exceeded for ${summary.violations} checks (>${summary.latencyBudgetMs}ms).`
    );
  }
}

if (require.main === module) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Benchmark failed", error);
    process.exit(1);
  });
}

export {
  runScenario
};
