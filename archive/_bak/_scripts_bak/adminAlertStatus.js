"use strict";

import fs from "fs";
import path from "path";

const DEFAULT_OBSERVATION_PATH = path.join(
  "artifacts",
  "admin-alert-observations.json"
);
const DEFAULT_WINDOW_MS = 1000 * 60 * 60 * 6; // six hours

function parseWindow(value) {
  if (!value) {
    return DEFAULT_WINDOW_MS;
  }

  const trimmed = String(value).trim().toLowerCase();
  const numeric = Number.parseFloat(trimmed);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Invalid window value "${value}"`);
  }

  if (trimmed.endsWith("h")) {
    return Math.round(numeric * 60 * 60 * 1000);
  }
  if (trimmed.endsWith("m")) {
    return Math.round(numeric * 60 * 1000);
  }
  if (trimmed.endsWith("s")) {
    return Math.round(numeric * 1000);
  }

  return Math.round(numeric);
}

function parseArgs(argv = process.argv) {
  const config = {
    observationPath: DEFAULT_OBSERVATION_PATH,
    windowMs: DEFAULT_WINDOW_MS,
    format: "text"
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--observation":
      case "--observation-path":
        config.observationPath = argv[++index] || config.observationPath;
        break;
      case "--window":
        config.windowMs = parseWindow(argv[++index]);
        break;
      case "--json":
        config.format = "json";
        break;
      case "--text":
        config.format = "text";
        break;
      case "--help":
      case "-h":
        config.help = true;
        break;
      default:
        if (arg && arg.startsWith("--")) {
          console.warn(`[admin-alert-status] Unknown option ${arg} ignored`);
        }
        break;
    }
  }

  return config;
}

function loadObservation(observationPath) {
  if (!observationPath) {
    return null;
  }

  const resolvedPath = path.isAbsolute(observationPath)
    ? observationPath
    : path.join(process.cwd(), observationPath);

  if (!fs.existsSync(resolvedPath)) {
    return { data: null, path: resolvedPath };
  }

  try {
    const raw = fs.readFileSync(resolvedPath, "utf8");
    const parsed = JSON.parse(raw);
    return { data: parsed, path: resolvedPath };
  } catch (error) {
    throw new Error(
      `Failed to load observation file at ${resolvedPath}: ${error.message}`
    );
  }
}

function analyzeObservation(observation, windowMs, now = Date.now()) {
  const summary = {
    hasObservation: Boolean(observation?.data),
    observedAt: observation?.data?.observedAt || null,
    seeded: observation?.data?.seeded ?? null,
    latencyMs: Number.isFinite(observation?.data?.latencyMs)
      ? observation.data.latencyMs
      : null,
    recommendation: {
      keepFallbackSeeding: true,
      reason: "No observation data available.",
      status: "missing"
    },
    windowMs,
    observedAgeMs: null,
    windowWithinMs: null,
    sourcePath: observation?.path || null
  };

  if (!observation?.data) {
    summary.recommendation = {
      keepFallbackSeeding: true,
      reason: "Observation file missing; rerun stage smoke to collect telemetry.",
      status: "missing"
    };
    return summary;
  }

  const observedAt = observation.data.observedAt;
  const parsedObserved = observedAt ? Date.parse(observedAt) : Number.NaN;
  const ageMs = Number.isFinite(parsedObserved) ? now - parsedObserved : null;
  const withinWindow =
    ageMs !== null && Number.isFinite(windowMs) && windowMs > 0
      ? ageMs <= windowMs
      : false;

  summary.observedAgeMs = ageMeetsThreshold(ageMs);
  summary.windowWithinMs = withinWindow ? ageMs : null;

  if (!observedAt) {
    summary.recommendation = {
      keepFallbackSeeding: true,
      reason:
        "Stage smoke ran without observing an admin alert. Maintain seeded fallback until live alerts arrive.",
      status: "no-alerts"
    };
    return summary;
  }

  if (!withinWindow) {
    summary.recommendation = {
      keepFallbackSeeding: true,
      reason:
        "Latest admin alert observation is outside the configured window. Capture a fresh run before disabling fallback seeding.",
      status: "stale"
    };
    return summary;
  }

  if (observation.data.seeded === false) {
    summary.recommendation = {
      keepFallbackSeeding: false,
      reason:
        "Live admin alert observed within the monitoring window. Safe to disable fallback seeding.",
      status: "ready"
    };
    return summary;
  }

  if (observation.data.seeded === true) {
    summary.recommendation = {
      keepFallbackSeeding: true,
      reason:
        "Most recent admin alert was seeded for validation. Retain fallback seeding until live telemetry arrives.",
      status: "seeded"
    };
    return summary;
  }

  summary.recommendation = {
    keepFallbackSeeding: true,
    reason:
      "Unable to determine seeded status from observation. Maintain fallback until telemetry is verified.",
    status: "unknown"
  };

  return summary;
}

function ageMeetsThreshold(ageMs) {
  if (!Number.isFinite(ageMs) || ageMs < 0) {
    return null;
  }
  return ageMs;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) {
    return "unknown";
  }

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

function renderText(summary) {
  const lines = [];
  lines.push("Admin Alert Observation Summary");
  lines.push("--------------------------------");
  lines.push(`Source: ${summary.sourcePath || "not found"}`);
  lines.push(
    `Observed at: ${summary.observedAt || "no admin alerts recorded"}`
  );
  if (summary.observedAgeMs !== null) {
    lines.push(`Age: ${formatDuration(summary.observedAgeMs)}`);
  }
  if (summary.latencyMs !== null) {
    lines.push(`Latency: ${summary.latencyMs}ms`);
  }
  lines.push(`Seeded fallback: ${summary.seeded === true ? "yes" : summary.seeded === false ? "no" : "unknown"}`);
  lines.push(
    `Within window (${formatDuration(summary.windowMs)}): ${
      summary.windowWithinMs !== null ? "yes" : "no"
    }`
  );
  lines.push("");
  lines.push(
    `Recommendation: ${
      summary.recommendation.keepFallbackSeeding
        ? "keep fallback seeding enabled"
        : "disable fallback seeding"
    }`
  );
  lines.push(`Rationale: ${summary.recommendation.reason}`);
  lines.push(`Status: ${summary.recommendation.status}`);

  return lines.join("\n");
}

function main(argv = process.argv, now = Date.now()) {
  const args = parseArgs(argv);

  if (args.help) {
    console.log(
      [
        "Usage: node scripts/adminAlertStatus.js [options]",
        "",
        "Options:",
        "  --observation <path>    Path to admin alert observation JSON (default: artifacts/admin-alert-observations.json)",
        "  --window <ms|Xm|Xh|Xs>   Monitoring window for live alerts (default: 6h)",
        "  --json                   Output machine-readable JSON summary",
        "  --text                   Force human-readable output (default)",
        "  -h, --help               Show this help message"
      ].join("\n")
    );
    return 0;
  }

  let observation;
  try {
    observation = loadObservation(args.observationPath);
  } catch (error) {
    console.error(`[admin-alert-status] ${error.message}`);
    return 1;
  }

  const summary = analyzeObservation(observation, args.windowMs, now);

  if (args.format === "json") {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(renderText(summary));
  }

  return 0;
}

if (require.main === module) {
  const exitCode = main(process.argv, Date.now());
  process.exitCode = exitCode;
}

export {
  DEFAULT_OBSERVATION_PATH,
  DEFAULT_WINDOW_MS,
  parseArgs,
  parseWindow,
  loadObservation,
  analyzeObservation,
  renderText,
  main,
  formatDuration
};
