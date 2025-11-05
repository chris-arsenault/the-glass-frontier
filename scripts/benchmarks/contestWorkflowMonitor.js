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

function readInputContent(inputPath) {
  if (inputPath) {
    const resolved = path.resolve(process.cwd(), inputPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Input file not found: ${resolved}`);
    }
    return fs.readFileSync(resolved, "utf8");
  }

  return fs.readFileSync(0, "utf8");
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

function parseNdjsonLines(rawContent) {
  if (!rawContent) {
    return [];
  }
  const lines = rawContent.split(/\r?\n/);
  const events = [];
  lines.forEach((line) => {
    const parsed = safeParse(line);
    if (parsed && typeof parsed === "object" && parsed.message) {
      events.push(parsed);
    }
  });
  return events;
}

function mapTimelineType(type) {
  switch (type) {
    case "telemetry.hub.contestArmed":
      return "telemetry.contest.armed";
    case "telemetry.hub.contestLaunched":
      return "telemetry.contest.launched";
    case "telemetry.hub.contestResolved":
      return "telemetry.contest.resolved";
    case "telemetry.hub.contestWorkflowFailed":
      return "telemetry.contest.workflowFailed";
    case "telemetry.hub.contestExpired":
      return "telemetry.contest.expired";
    case "telemetry.hub.contestSentiment":
      return "telemetry.contest.sentiment";
    default:
      return null;
  }
}

function parseStructuredEvents(rawContent) {
  if (!rawContent) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawContent);

    const rootEvents = [];

    if (Array.isArray(parsed)) {
      parsed.forEach((entry) => {
        if (entry && typeof entry === "object" && entry.message) {
          rootEvents.push(entry);
        }
      });
      if (rootEvents.length > 0) {
        return rootEvents;
      }
    }

    if (!parsed || typeof parsed !== "object") {
      return [];
    }

    const events = [];

    const timeline = Array.isArray(parsed.timeline) ? parsed.timeline : null;
    if (!timeline) {
      // continue to other structured formats
    } else {
      timeline.forEach((entry) => {
        if (!entry || typeof entry !== "object") {
          return;
        }

        const mappedMessage = mapTimelineType(entry.type);
        if (!mappedMessage) {
          return;
        }

        const payload = entry.payload || {};
        if (mappedMessage === "telemetry.contest.sentiment") {
          events.push({
            message: mappedMessage,
            hubId: payload.hubId || parsed.hubId || null,
            roomId: payload.roomId || parsed.roomId || null,
            contestId: payload.contestId || parsed.contestId || null,
            contestKey: payload.contestKey || parsed.contestKey || null,
            actorId: payload.actorId || null,
            sentiment: payload.sentiment || null,
            tone: payload.tone || null,
            phase: payload.phase || null,
            remainingCooldownMs:
              typeof payload.remainingCooldownMs === "number"
                ? payload.remainingCooldownMs
                : null,
            cooldownMs:
              typeof payload.cooldownMs === "number" ? payload.cooldownMs : null,
            messageLength:
              typeof payload.messageLength === "number" ? payload.messageLength : null,
            issuedAt: payload.issuedAt ?? null
          });
          return;
        }
        events.push({
          message: mappedMessage,
          hubId: payload.hubId || parsed.hubId || null,
          roomId: payload.roomId || parsed.roomId || null,
          contestId: payload.contestId || parsed.contestId || null,
          contestKey: payload.contestKey || parsed.contestKey || null,
          armingDurationMs:
            payload.armingDurationMs !== undefined ? payload.armingDurationMs : null,
          resolutionDurationMs:
            payload.resolutionDurationMs !== undefined ? payload.resolutionDurationMs : null,
          participantCount:
            payload.participantCount !== undefined ? payload.participantCount : null,
          participantCapacity:
            payload.participantCapacity !== undefined ? payload.participantCapacity : null,
          outcomeTier:
            (payload.outcome && payload.outcome.tier) || payload.outcomeTier || null
        });
      });
    }

    const rawContests = parsed.raw?.contests;
    if (Array.isArray(rawContests) && rawContests.length > 0) {
      rawContests.forEach((contest) => {
        if (!contest || typeof contest !== "object") {
          return;
        }

        events.push({
          message: "telemetry.contest.launched",
          contestId: contest.contestId || null,
          hubId: contest.hubId || null,
          roomId: contest.roomId || null,
          armingDurationMs:
            contest.armingDurationMs !== undefined ? contest.armingDurationMs : null,
          participantCount:
            contest.participantCount !== undefined ? contest.participantCount : null,
          participantCapacity:
            contest.participantCapacity !== undefined ? contest.participantCapacity : null
        });

        events.push({
          message: "telemetry.contest.resolved",
          contestId: contest.contestId || null,
          hubId: contest.hubId || null,
          roomId: contest.roomId || null,
          armingDurationMs:
            contest.armingDurationMs !== undefined ? contest.armingDurationMs : null,
          resolutionDurationMs:
            contest.resolutionDurationMs !== undefined ? contest.resolutionDurationMs : null,
          participantCount:
            contest.participantCount !== undefined ? contest.participantCount : null,
          participantCapacity:
            contest.participantCapacity !== undefined ? contest.participantCapacity : null,
          outcomeTier: Array.isArray(contest.outcomes) ? contest.outcomes[0] || null : null
        });
      });
    }

    const rawFailures = parsed.raw?.workflowFailures;
    if (Array.isArray(rawFailures) && rawFailures.length > 0) {
      rawFailures.forEach((failure) => {
        if (!failure || typeof failure !== "object") {
          return;
        }
        events.push({
          message: "telemetry.contest.workflowFailed",
          contestId: failure.contestId || null,
          hubId: failure.hubId || null,
          roomId: failure.roomId || null,
          error: failure.error || "workflow_failed"
        });
      });
    }

    const rawExpired = parsed.raw?.expired;
    const expiredDurations = Array.isArray(rawExpired?.armingDurations)
      ? rawExpired.armingDurations
      : [];
    const expiredParticipants = Array.isArray(rawExpired?.participantCounts)
      ? rawExpired.participantCounts
      : [];
    const expiredLength = Math.max(expiredDurations.length, expiredParticipants.length);
    for (let index = 0; index < expiredLength; index += 1) {
      events.push({
        message: "telemetry.contest.expired",
        hubId: parsed.hubId || null,
        roomId: parsed.roomId || null,
        armingDurationMs:
          typeof expiredDurations[index] === "number" ? expiredDurations[index] : null,
        participantCount:
          typeof expiredParticipants[index] === "number" ? expiredParticipants[index] : null
      });
    }

    return events;
  } catch (_error) {
    return [];
  }
}

function parseContestEvents(rawContent) {
  if (!rawContent) {
    return [];
  }

  const ndjsonEvents = parseNdjsonLines(rawContent);
  if (ndjsonEvents.length > 0) {
    return ndjsonEvents;
  }

  return parseStructuredEvents(rawContent);
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

function toTimestampMs(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
}

function buildSummary(events, thresholds) {
  const contests = new Map();
  const workflowFailures = [];
  const expiredArmingDurations = [];
  const expiredParticipantCounts = [];
  const sentimentSamples = [];
  const sentimentCounts = {
    positive: 0,
    neutral: 0,
    negative: 0,
    other: 0
  };
  const sentimentPhaseCounts = {};
  const sentimentHotspots = new Map();
  let cooldownSamples = 0;
  let negativeDuringCooldown = 0;
  let maxRemainingCooldownMs = null;

  let expiredContests = 0;

  events.forEach((event) => {
    if (!event || typeof event !== "object") {
      return;
    }
    const { message } = event;

    if (message === "telemetry.contest.workflowFailed") {
      workflowFailures.push(event);
      return;
    }

    if (message === "telemetry.contest.expired") {
      expiredContests += 1;
      const armingDuration = collectNumber(event.armingDurationMs);
      if (armingDuration !== null) {
        expiredArmingDurations.push(armingDuration);
      }
      const participantCount = collectNumber(event.participantCount);
      if (participantCount !== null) {
        expiredParticipantCounts.push(participantCount);
      }
      return;
    }

    if (message === "telemetry.contest.sentiment") {
      const label =
        typeof event.sentiment === "string" ? event.sentiment.toLowerCase() : "unknown";
      const normalizedLabel =
        label === "positive" || label === "negative" || label === "neutral"
          ? label
          : "other";
      sentimentCounts[normalizedLabel] = (sentimentCounts[normalizedLabel] || 0) + 1;

      const phase =
        typeof event.phase === "string" ? event.phase.toLowerCase() : "unknown";
      if (phase !== "unknown") {
        sentimentPhaseCounts[phase] = (sentimentPhaseCounts[phase] || 0) + 1;
      }

      const remainingCooldownMs = collectNumber(event.remainingCooldownMs);
      const cooldownMs = collectNumber(event.cooldownMs);
      const issuedAt =
        toTimestampMs(event.issuedAt) ?? toTimestampMs(event.timestamp) ?? null;

      const sample = {
        hubId: event.hubId || null,
        roomId: event.roomId || null,
        contestId: event.contestId || null,
        contestKey: event.contestKey || null,
        actorId: event.actorId || null,
        sentiment: label || null,
        tone: typeof event.tone === "string" ? event.tone : null,
        phase: phase === "unknown" ? null : phase,
        remainingCooldownMs,
        cooldownMs,
        messageLength: collectNumber(event.messageLength),
        issuedAt,
        issuedAtIso: issuedAt ? new Date(issuedAt).toISOString() : null
      };
      sentimentSamples.push(sample);

      if (remainingCooldownMs !== null && remainingCooldownMs > 0) {
        cooldownSamples += 1;
        if (normalizedLabel === "negative") {
          negativeDuringCooldown += 1;
        }
        if (
          maxRemainingCooldownMs === null ||
          remainingCooldownMs > maxRemainingCooldownMs
        ) {
          maxRemainingCooldownMs = remainingCooldownMs;
        }
      }

      const hotspotKey = `${sample.hubId || "unknown"}:${sample.roomId || "unknown"}`;
      const hotspot = sentimentHotspots.get(hotspotKey) || {
        hubId: sample.hubId || null,
        roomId: sample.roomId || null,
        totals: {
          positive: 0,
          neutral: 0,
          negative: 0,
          other: 0,
          total: 0
        }
      };
      hotspot.totals[normalizedLabel] =
        (hotspot.totals[normalizedLabel] || 0) + 1;
      hotspot.totals.total = (hotspot.totals.total || 0) + 1;
      sentimentHotspots.set(hotspotKey, hotspot);

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
        outcomes: [],
        resolved: false
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
      record.resolved = true;
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

  let resolvedContests = 0;
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
    } else if (record.resolved) {
      missingResolution += 1;
    }

    if (record.resolved) {
      resolvedContests += 1;
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
  expiredArmingDurations.sort((a, b) => a - b);
  expiredParticipantCounts.sort((a, b) => a - b);

  const armingP95 = percentile(armingDurations, 95);
  const resolutionP95 = percentile(resolutionDurations, 95);
  const armingP50 = percentile(armingDurations, 50);
  const resolutionP50 = percentile(resolutionDurations, 50);
  const expiredArmingP95 = percentile(expiredArmingDurations, 95);
  const expiredArmingP50 = percentile(expiredArmingDurations, 50);

  const multiActorCount = participantCounts.filter((count) => count > 2).length;
  const capacityOverTwo = participantCapacities.filter((count) => count > 2).length;
  const expiredMultiActorCount = expiredParticipantCounts.filter((count) => count > 2).length;

  sentimentSamples.sort((a, b) => {
    const aIssued = a.issuedAt ?? 0;
    const bIssued = b.issuedAt ?? 0;
    return bIssued - aIssued;
  });

  const sortedHotspots = Array.from(sentimentHotspots.values()).sort((a, b) => {
    const aNegative = a.totals.negative || 0;
    const bNegative = b.totals.negative || 0;
    if (bNegative !== aNegative) {
      return bNegative - aNegative;
    }
    const aTotal = a.totals.total || 0;
    const bTotal = b.totals.total || 0;
    if (bTotal !== aTotal) {
      return bTotal - aTotal;
    }
    return `${a.hubId || ""}${a.roomId || ""}`.localeCompare(
      `${b.hubId || ""}${b.roomId || ""}`
    );
  });

  return {
    totals: {
      contestsObserved: contests.size,
      resolvedContests,
      workflowFailures: workflowFailures.length,
      expiredContests
    },
    sentiment: {
      samples: sentimentSamples.length,
      totals: {
        positive: sentimentCounts.positive || 0,
        neutral: sentimentCounts.neutral || 0,
        negative: sentimentCounts.negative || 0,
        other: sentimentCounts.other || 0,
        total:
          (sentimentCounts.positive || 0) +
          (sentimentCounts.neutral || 0) +
          (sentimentCounts.negative || 0) +
          (sentimentCounts.other || 0)
      },
      phaseCounts: sentimentPhaseCounts,
      cooldown: {
        activeSamples: cooldownSamples,
        negativeDuringCooldown,
        maxRemainingCooldownMs
      },
      hotspots: sortedHotspots.slice(0, 10),
      latest: sentimentSamples.slice(0, 25)
    },
    durations: {
      arming: {
        samples: armingDurations.length,
        missing: missingArming,
        p50: armingP50,
        p95: armingP95,
        max: armingDurations.length > 0 ? armingDurations[armingDurations.length - 1] : null,
        budget: thresholds.armingP95,
        breached: armingP95 !== null && armingP95 > thresholds.armingP95
      },
      resolution: {
        samples: resolutionDurations.length,
        missing: missingResolution,
        p50: resolutionP50,
        p95: resolutionP95,
        max:
          resolutionDurations.length > 0
            ? resolutionDurations[resolutionDurations.length - 1]
            : null,
        budget: thresholds.resolutionP95,
        breached: resolutionP95 !== null && resolutionP95 > thresholds.resolutionP95
      },
      expiredArming: {
        samples: expiredArmingDurations.length,
        missing: 0,
        p50: expiredArmingP50,
        p95: expiredArmingP95,
        max:
          expiredArmingDurations.length > 0
            ? expiredArmingDurations[expiredArmingDurations.length - 1]
            : null,
        budget: thresholds.armingP95,
        breached: expiredArmingP95 !== null && expiredArmingP95 > thresholds.armingP95
      }
    },
    participants: {
      samples: participantCounts.length,
      average: average(participantCounts),
      max: participantCounts.length > 0 ? participantCounts[participantCounts.length - 1] : null,
      multiActorContests: multiActorCount,
      capacityOverTwo,
      timeouts: {
        samples: expiredParticipantCounts.length,
        average: average(expiredParticipantCounts),
        max:
          expiredParticipantCounts.length > 0
            ? expiredParticipantCounts[expiredParticipantCounts.length - 1]
            : null,
        multiActorContests: expiredMultiActorCount
      }
    },
    raw: {
      contests: Array.from(contests.values()),
      workflowFailures,
      expired: expiredArmingDurations.length > 0 || expiredParticipantCounts.length > 0
        ? {
            armingDurations: expiredArmingDurations,
            participantCounts: expiredParticipantCounts
          }
        : null
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
  if (summary.totals.expiredContests > 0) {
    lines.push(`Expired contests (timeouts): ${summary.totals.expiredContests}`);
  }

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

  if (summary.durations.expiredArming.samples > 0) {
    const expired = summary.durations.expiredArming;
    lines.push(
      `Timeout arming p95: ${expired.p95?.toFixed(2) ?? "n/a"} ms (budget ${
        expired.budget
      } ms)`
    );
    lines.push(
      `Timeout arming p50 / max: ${expired.p50?.toFixed(2) ?? "n/a"} ms / ${
        expired.max?.toFixed(2) ?? "n/a"
      } ms`
    );
  } else if (summary.totals.expiredContests > 0) {
    lines.push("Timeout arming samples: none");
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

  if (summary.participants.timeouts.samples > 0) {
    lines.push(
      `Timeout participant average: ${
        summary.participants.timeouts.average?.toFixed(2) ?? "n/a"
      } (max ${summary.participants.timeouts.max ?? "n/a"})`
    );
    lines.push(
      `Timeout contests with >2 participants: ${summary.participants.timeouts.multiActorContests} / ${summary.participants.timeouts.samples}`
    );
  } else if (summary.totals.expiredContests > 0) {
    lines.push("Timeout participant data: none");
  }

  return lines.join("\n");
}

function main() {
  try {
    const args = parseArgs(process.argv);
    const rawContent = readInputContent(args.input);
    const events = parseContestEvents(rawContent);
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
  parseContestEvents,
  buildSummary,
  formatSummary
};
