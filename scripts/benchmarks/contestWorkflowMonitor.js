#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_THRESHOLDS = {
  armingP95: 8000,
  resolutionP95: 800
};

function parseArgs(argv) {
  const args = {
    input: null,
    json: false,
    armingP95: DEFAULT_THRESHOLDS.armingP95,
    resolutionP95: DEFAULT_THRESHOLDS.resolutionP95
  };

  for (let index = 2; index < argv.length; index += 1) {
    const raw = argv[index];
    if (!raw.startsWith("--")) {
      continue;
    }

    const [flag, value] = raw.split("=");
    const nextValue =
      value !== undefined
        ? value
        : argv[index + 1] && !argv[index + 1].startsWith("--")
        ? argv[++index]
        : undefined;

    switch (flag) {
      case "--input":
      case "-i":
        if (!nextValue) {
          throw new Error("Missing value for --input");
        }
        args.input = nextValue;
        break;
      case "--json":
        args.json = true;
        break;
      case "--arming-threshold":
        args.armingP95 = Number(nextValue);
        break;
      case "--resolution-threshold":
        args.resolutionP95 = Number(nextValue);
        break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }

  if (Number.isNaN(args.armingP95) || args.armingP95 <= 0) {
    throw new Error("arming threshold must be a positive number");
  }

  if (Number.isNaN(args.resolutionP95) || args.resolutionP95 <= 0) {
    throw new Error("resolution threshold must be a positive number");
  }

  return args;
}

function readInputLines(inputPath) {
  if (inputPath) {
    const resolved = path.resolve(process.cwd(), inputPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Input file not found: ${resolved}`);
    }
    const content = fs.readFileSync(resolved, "utf8");
    return content.split(/\r?\n/);
  }

  const buffer = fs.readFileSync(0, "utf8");
  return buffer.split(/\r?\n/);
}

function safeParse(line) {
  if (!line || !line.trim()) {
    return null;
  }
  try {
    return JSON.parse(line);
  } catch (error) {
    return null;
  }
}

function percentile(sortedValues, rank) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) {
    return null;
  }
  if (sortedValues.length === 1) {
    return sortedValues[0];
  }
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil((rank / 100) * sortedValues.length) - 1)
  );
  return sortedValues[index];
}

function average(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function collectNumber(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return value;
}

function buildSummary(events, thresholds) {
  const contests = new Map();
  const workflowFailures = [];

  events.forEach((event) => {
    if (!event || typeof event !== "object") {
      return;
    }
    const { message } = event;

    if (message === "telemetry.contest.workflowFailed") {
      workflowFailures.push(event);
      return;
    }

    if (!message || !message.startsWith("telemetry.contest.")) {
      return;
    }

    const contestId = event.contestId;
    if (!contestId) {
      return;
    }

    if (!contests.has(contestId)) {
      contests.set(contestId, {
        contestId,
        hubId: event.hubId || null,
        roomId: event.roomId || null,
        armingDurationMs: null,
        resolutionDurationMs: null,
        participantCount: null,
        participantCapacity: null,
        outcomes: []
      });
    }

    const record = contests.get(contestId);

    if (message === "telemetry.contest.launched") {
      record.armingDurationMs =
        collectNumber(event.armingDurationMs) ?? record.armingDurationMs;
      record.participantCount =
        collectNumber(event.participantCount) ?? record.participantCount;
      record.participantCapacity =
        collectNumber(event.participantCapacity) ?? record.participantCapacity;
      return;
    }

    if (message === "telemetry.contest.resolved") {
      record.resolutionDurationMs =
        collectNumber(event.resolutionDurationMs) ?? record.resolutionDurationMs;
      record.armingDurationMs =
        collectNumber(event.armingDurationMs) ?? record.armingDurationMs;
      record.participantCount =
        collectNumber(event.participantCount) ?? record.participantCount;
      record.participantCapacity =
        collectNumber(event.participantCapacity) ?? record.participantCapacity;
      if (event.outcomeTier) {
        record.outcomes.push(event.outcomeTier);
      }
    }
  });

  const armingDurations = [];
  const resolutionDurations = [];
  const participantCounts = [];
  const participantCapacities = [];

  let missingArming = 0;
  let missingResolution = 0;

  for (const record of contests.values()) {
    if (record.armingDurationMs !== null) {
      armingDurations.push(record.armingDurationMs);
    } else {
      missingArming += 1;
    }

    if (record.resolutionDurationMs !== null) {
      resolutionDurations.push(record.resolutionDurationMs);
    } else {
      missingResolution += 1;
    }

    if (record.participantCount !== null) {
      participantCounts.push(record.participantCount);
    }
    if (record.participantCapacity !== null) {
      participantCapacities.push(record.participantCapacity);
    }
  }

  armingDurations.sort((a, b) => a - b);
  resolutionDurations.sort((a, b) => a - b);
  participantCounts.sort((a, b) => a - b);
  participantCapacities.sort((a, b) => a - b);

  const armingP95 = percentile(armingDurations, 95);
  const resolutionP95 = percentile(resolutionDurations, 95);

  const multiActorCount = participantCounts.filter((count) => count > 2).length;
  const capacityOverTwo = participantCapacities.filter((count) => count > 2).length;

  return {
    totals: {
      contestsObserved: contests.size,
      resolvedContests: contests.size - missingResolution,
      workflowFailures: workflowFailures.length
    },
    durations: {
      arming: {
        samples: armingDurations.length,
        missing: missingArming,
        p50: percentile(armingDurations, 50),
        p95: armingP95,
        max: armingDurations.length > 0 ? armingDurations[armingDurations.length - 1] : null,
        budget: thresholds.armingP95,
        breached: armingP95 !== null && armingP95 > thresholds.armingP95
      },
      resolution: {
        samples: resolutionDurations.length,
        missing: missingResolution,
        p50: percentile(resolutionDurations, 50),
        p95: resolutionP95,
        max:
          resolutionDurations.length > 0
            ? resolutionDurations[resolutionDurations.length - 1]
            : null,
        budget: thresholds.resolutionP95,
        breached: resolutionP95 !== null && resolutionP95 > thresholds.resolutionP95
      }
    },
    participants: {
      samples: participantCounts.length,
      average: average(participantCounts),
      max: participantCounts.length > 0 ? participantCounts[participantCounts.length - 1] : null,
      multiActorContests: multiActorCount,
      capacityOverTwo
    },
    raw: {
      contests: Array.from(contests.values()),
      workflowFailures
    }
  };
}

function formatSummary(summary) {
  const lines = [];
  lines.push("Contest Workflow Load Summary");
  lines.push("============================");
  lines.push(`Contests observed: ${summary.totals.contestsObserved}`);
  lines.push(
    `Resolved contests: ${summary.totals.resolvedContests} (workflow failures: ${summary.totals.workflowFailures})`
  );

  if (summary.durations.arming.samples > 0) {
    const arming = summary.durations.arming;
    lines.push(
      `Arming duration p95: ${arming.p95?.toFixed(2) ?? "n/a"} ms (budget ${arming.budget} ms)${
        arming.breached ? " ⚠" : ""
      }`
    );
    lines.push(
      `Arming duration p50 / max: ${arming.p50?.toFixed(2) ?? "n/a"} ms / ${
        arming.max?.toFixed(2) ?? "n/a"
      } ms`
    );
    if (arming.missing > 0) {
      lines.push(`Arming samples missing: ${arming.missing}`);
    }
  } else {
    lines.push("Arming duration samples: none");
  }

  if (summary.durations.resolution.samples > 0) {
    const resolution = summary.durations.resolution;
    lines.push(
      `Resolution duration p95: ${resolution.p95?.toFixed(2) ?? "n/a"} ms (budget ${
        resolution.budget
      } ms)${resolution.breached ? " ⚠" : ""}`
    );
    lines.push(
      `Resolution duration p50 / max: ${resolution.p50?.toFixed(2) ?? "n/a"} ms / ${
        resolution.max?.toFixed(2) ?? "n/a"
      } ms`
    );
    if (resolution.missing > 0) {
      lines.push(`Resolution samples missing: ${resolution.missing}`);
    }
  } else {
    lines.push("Resolution duration samples: none");
  }

  if (summary.participants.samples > 0) {
    lines.push(
      `Average participants: ${summary.participants.average?.toFixed(2) ?? "n/a"} (max ${
        summary.participants.max ?? "n/a"
      })`
    );
    lines.push(
      `Contests with >2 participants: ${summary.participants.multiActorContests} / ${summary.participants.samples}`
    );
    if (summary.participants.capacityOverTwo > 0) {
      lines.push(
        `Contest capacity requests >2 participants: ${summary.participants.capacityOverTwo}`
      );
    }
  } else {
    lines.push("Participant data: none");
  }

  return lines.join("\n");
}

function main() {
  try {
    const args = parseArgs(process.argv);
    const lines = readInputLines(args.input);
    const events = lines.map(safeParse).filter(Boolean);
    const summary = buildSummary(events, {
      armingP95: args.armingP95,
      resolutionP95: args.resolutionP95
    });

    if (args.json) {
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    } else {
      process.stdout.write(`${formatSummary(summary)}\n`);
    }
  } catch (error) {
    process.stderr.write(`contestWorkflowMonitor: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_THRESHOLDS,
  parseArgs,
  buildSummary,
  formatSummary
};
