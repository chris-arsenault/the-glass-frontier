"use strict";

const fs = require("fs");
const path = require("path");
const { runVerticalSliceScenario, createSequentialRandomizer } = require("../src/narrative/scenarios/verticalSliceScenario");
const { SessionTelemetry } = require("../src/narrative/langGraph/telemetry");

function parseArgs(argv) {
  const defaults = {
    outputDir: path.join(process.cwd(), "artifacts", "vertical-slice"),
    sessionId: null,
    scriptPath: null,
    randomizer: null,
    verbose: false
  };

  const result = { ...defaults };
  const args = Array.isArray(argv) ? argv.slice() : [];

  while (args.length > 0) {
    const token = args.shift();
    if (token === "--output" || token === "-o") {
      result.outputDir = path.resolve(args.shift());
      continue;
    }
    if (token === "--session" || token === "-s") {
      result.sessionId = args.shift();
      continue;
    }
    if (token === "--script") {
      result.scriptPath = path.resolve(args.shift());
      continue;
    }
    if (token === "--randomizer") {
      result.randomizer = args.shift();
      continue;
    }
    if (token === "--verbose" || token === "-v") {
      result.verbose = true;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  return result;
}

function ensureDirectory(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function loadScript(scriptPath) {
  if (!scriptPath) {
    return null;
  }

  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Script file not found: ${scriptPath}`);
  }

  const content = fs.readFileSync(scriptPath, "utf8");
  try {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      throw new Error("Script JSON must be an array of message steps");
    }
    return parsed;
  } catch (error) {
    throw new Error(`Failed to parse script JSON: ${error.message}`);
  }
}

function parseRandomizerSequences(serialized) {
  if (!serialized) {
    return null;
  }

  const groups = serialized.split("|").map((group) =>
    group
      .split(",")
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isFinite(value))
  );

  const filtered = groups.filter((group) => group.length > 0);
  return filtered.length > 0 ? filtered : null;
}

function telemetryEmitterStore(verbose) {
  const events = [];
  const emitter = (level, message, metadata = {}) => {
    const event = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...metadata
    };
    events.push(event);
    if (verbose) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(event));
    }
  };

  return { events, emitter };
}

function mapTranscriptToNarrativeSummary(transcript = []) {
  const summary = {
    turnCount: 0,
    playerMessages: 0,
    gmMessages: 0,
    systemMessages: 0,
    safetyFlags: [],
    moves: []
  };

  const safetyFlags = new Set();
  const moves = new Set();

  transcript.forEach((entry) => {
    if (!entry) {
      return;
    }
    summary.turnCount += 1;
    if (entry.role === "player") {
      summary.playerMessages += 1;
    } else if (entry.role === "gm") {
      summary.gmMessages += 1;
    } else {
      summary.systemMessages += 1;
    }

    const flags = entry.metadata?.safetyFlags || entry.metadata?.flags || [];
    flags.forEach((flag) => safetyFlags.add(flag));

    const move = entry.metadata?.move || entry.metadata?.detectedMove;
    if (typeof move === "string" && move.length > 0) {
      moves.add(move);
    }
  });

  summary.safetyFlags = Array.from(safetyFlags).sort();
  summary.moves = Array.from(moves).sort();

  return summary;
}

function serialize(value) {
  return JSON.parse(
    JSON.stringify(value, (_key, candidate) => {
      if (candidate instanceof Map) {
        return Array.from(candidate.entries());
      }
      if (candidate instanceof Set) {
        return Array.from(candidate.values());
      }
      if (candidate instanceof Date) {
        return candidate.toISOString();
      }
      return candidate;
    })
  );
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    ensureDirectory(args.outputDir);

    const script = loadScript(args.scriptPath);
    const sequences = parseRandomizerSequences(args.randomizer);

    const { events, emitter } = telemetryEmitterStore(args.verbose);
    const telemetry = new SessionTelemetry({ emitter });

    const options = {
      sessionId: args.sessionId,
      telemetry
    };

    if (script) {
      options.script = script;
    }

    if (sequences) {
      options.randomizer = createSequentialRandomizer(sequences);
    }

    const result = await runVerticalSliceScenario(options);
    const exportedAt = new Date().toISOString();
    const summary = {
      sessionId: result.sessionId,
      exportedAt,
      turnCount: result.transcript.length,
      resolvedChecks: result.resolvedChecks.length,
      vetoedChecks: result.vetoedChecks.length,
      adminAlerts: result.adminAlerts.length,
      closureStatus: result.closureJob?.status || null,
      closureResult: result.closureJob?.result || null,
      telemetryEvents: events.length,
      narrative: mapTranscriptToNarrativeSummary(result.transcript)
    };

    const baseName = `${result.sessionId}`;
    const sessionPath = path.join(args.outputDir, `${baseName}.json`);
    const transcriptPath = path.join(args.outputDir, `${baseName}-transcript.json`);
    const summaryPath = path.join(args.outputDir, `${baseName}-summary.json`);

    const payload = {
      ...summary,
      transcript: result.transcript,
      changeFeed: result.changeFeed,
      resolvedChecks: result.resolvedChecks,
      vetoedChecks: result.vetoedChecks,
      adminAlerts: result.adminAlerts,
      closureJob: result.closureJob,
      sessionState: serialize(result.sessionState),
      telemetryEvents: events
    };

    fs.writeFileSync(sessionPath, JSON.stringify(payload, null, 2));
    fs.writeFileSync(transcriptPath, JSON.stringify(result.transcript, null, 2));
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          status: "ok",
          sessionId: result.sessionId,
          summaryPath,
          sessionPath,
          transcriptPath
        },
        null,
        2
      )
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify(
        {
          status: "error",
          message: error.message
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  mapTranscriptToNarrativeSummary,
  parseRandomizerSequences,
  serialize
};
