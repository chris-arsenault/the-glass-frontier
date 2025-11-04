"use strict";

const fs = require("fs");
const path = require("path");
const {
  storyConsolidation: { StoryConsolidationWorkflow },
  entityExtraction: { extractEntities },
  delta: { WorldDeltaQueue },
  publishing: { PublishingCoordinator }
} = require("../src/offline");

function isSessionArtifactFile(filePath) {
  const base = path.basename(filePath);
  if (!base.endsWith(".json")) {
    return false;
  }
  if (base.includes("offline-qa")) {
    return false;
  }
  if (base.endsWith("-transcript.json") || base.endsWith("-summary.json")) {
    return false;
  }

  return true;
}

function parseArgs(argv) {
  const defaults = {
    input: path.join(process.cwd(), "artifacts", "vertical-slice", "imp-gm-06-smoke.json"),
    outputDir: path.join(process.cwd(), "artifacts", "offline-qa"),
    sessionId: null,
    verbose: false
  };

  const args = Array.isArray(argv) ? argv.slice() : [];
  const options = { ...defaults };

  while (args.length > 0) {
    const token = args.shift();
    if (token === "--input" || token === "-i") {
      options.input = path.resolve(args.shift());
      continue;
    }
    if (token === "--output" || token === "-o") {
      options.outputDir = path.resolve(args.shift());
      continue;
    }
    if (token === "--session" || token === "-s") {
      options.sessionId = args.shift();
      continue;
    }
    if (token === "--verbose" || token === "-v") {
      options.verbose = true;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  return options;
}

function ensureDirectory(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function loadSessionArtifact(artifactPath) {
  if (!artifactPath) {
    throw new Error("offline_qa_requires_input");
  }
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`offline_qa_input_missing: ${artifactPath}`);
  }

  const raw = fs.readFileSync(artifactPath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`offline_qa_input_parse_failed: ${error.message}`);
  }
}

function sanitizeTranscript(transcript = []) {
  return transcript
    .filter(Boolean)
    .map((entry, index) => {
      const text = typeof entry.text === "string" ? entry.text : entry.content || "";
      return {
        turnId: entry.turnId || entry.id || `turn-${index + 1}`,
        sceneId: entry.sceneId || entry.metadata?.sceneId || null,
        actId: entry.actId || entry.metadata?.actId || null,
        speaker: entry.speaker || entry.role || "gm",
        text,
        timestamp: entry.timestamp || entry.metadata?.timestamp || null,
        metadata: entry.metadata ? { ...entry.metadata } : {}
      };
    })
    .filter((entry) => typeof entry.text === "string" && entry.text.trim().length > 0);
}

function buildSessionMetadata(sessionState = {}, auditJob = {}) {
  const momentum = sessionState?.momentum || sessionState?.shards?.momentum?.data || {};
  const character = sessionState?.character || sessionState?.shards?.character?.data || {};
  const location = sessionState?.location || {};

  return {
    character,
    location,
    momentum,
    closure: {
      auditRef: auditJob.auditRef || sessionState.lastClosureAuditRef || null,
      reason: auditJob.reason || sessionState.closureReason || null,
      closedAt: auditJob.closedAt || sessionState.closedAt || null,
      trigger: auditJob.trigger || null,
      pendingChecks: auditJob.pendingChecks || 0
    },
    scenes: Array.isArray(sessionState?.scenes) ? sessionState.scenes : [],
    tags: Array.isArray(sessionState?.labels) ? sessionState.labels : []
  };
}

function collectSafetyEvents(sessionState = {}) {
  const changes = Array.isArray(sessionState.changeFeed) ? sessionState.changeFeed : [];
  return changes
    .filter((entry) => Array.isArray(entry.safetyFlags) && entry.safetyFlags.length > 0)
    .map((entry) => ({
      shard: entry.shard || null,
      safetyFlags: entry.safetyFlags,
      capabilityRefs: entry.capabilityRefs || [],
      timestamp: entry.timestamp || null,
      reason: entry.reason || null
    }));
}

function composeQaResult({
  sessionId,
  summaryRecord,
  mentions,
  deltas,
  publishingPlan,
  searchPlan
}) {
  return {
    sessionId,
    generatedAt: new Date().toISOString(),
    summary: summaryRecord,
    entityExtraction: {
      mentionCount: mentions.length,
      mentions
    },
    worldDeltas: {
      deltaCount: deltas.length,
      deltas
    },
    publishing: {
      schedule: publishingPlan.schedule,
      preparedBatch: publishingPlan.publishing,
      searchPlan
    },
    moderation: summarizeModeration(deltas)
  };
}

function summarizeModeration(deltas = []) {
  const summary = {
    requiresModeration: false,
    reasons: [],
    capabilityViolations: 0,
    conflictDetections: 0,
    lowConfidenceFindings: 0
  };

  const reasonSet = new Set();

  deltas.forEach((delta) => {
    if (!delta || !delta.safety) {
      return;
    }

    if (delta.safety.requiresModeration) {
      summary.requiresModeration = true;
    }

    const reasons = Array.isArray(delta.safety.reasons) ? delta.safety.reasons : [];
    reasons.forEach((reason) => {
      reasonSet.add(reason);
      if (reason === "capability_violation") {
        summary.capabilityViolations += 1;
      }
      if (reason === "conflict_detected") {
        summary.conflictDetections += 1;
      }
      if (reason === "low_confidence") {
        summary.lowConfidenceFindings += 1;
      }
    });
  });

  summary.reasons = Array.from(reasonSet).sort();
  return summary;
}

function resolveInputTargets(inputPath) {
  if (!inputPath) {
    throw new Error("offline_qa_requires_input");
  }

  let stats;
  try {
    stats = fs.statSync(inputPath);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      throw new Error(`offline_qa_input_missing: ${inputPath}`);
    }
    throw error;
  }

  if (!stats.isDirectory()) {
    return [inputPath];
  }

  const entries = fs
    .readdirSync(inputPath)
    .map((entry) => path.join(inputPath, entry))
    .filter((candidate) => {
      try {
        return fs.statSync(candidate).isFile() && isSessionArtifactFile(candidate);
      } catch (_error) {
        return false;
      }
    })
    .sort();

  if (entries.length === 0) {
    throw new Error(`offline_qa_no_session_artifacts: ${inputPath}`);
  }

  return entries;
}

function composeBatchRollup(summaries = []) {
  const rollup = {
    totalSessions: summaries.length,
    totalMentions: 0,
    totalDeltas: 0,
    sessionsWithModeration: 0,
    sessionsWithCapabilityViolations: 0,
    sessionsWithConflicts: 0,
    sessionsWithLowConfidence: 0
  };

  summaries.forEach((summary) => {
    rollup.totalMentions += summary.mentionCount || 0;
    rollup.totalDeltas += summary.deltaCount || 0;

    if (summary.requiresModeration) {
      rollup.sessionsWithModeration += 1;
    }
    if ((summary.capabilityViolations || 0) > 0) {
      rollup.sessionsWithCapabilityViolations += 1;
    }
    if ((summary.conflictDetections || 0) > 0) {
      rollup.sessionsWithConflicts += 1;
    }
    if ((summary.lowConfidenceDeltas || 0) > 0) {
      rollup.sessionsWithLowConfidence += 1;
    }
  });

  return rollup;
}

async function executeOfflineQa(options) {
  const artifact = loadSessionArtifact(options.input);
  const sessionId = options.sessionId || artifact.sessionId;
  if (!sessionId) {
    throw new Error("offline_qa_requires_session_id");
  }

  const sessionState = artifact.sessionState || {};
  const rawTranscript = Array.isArray(artifact.transcript) ? artifact.transcript : [];
  const transcript = sanitizeTranscript(rawTranscript);

  const safetyEvents = collectSafetyEvents(sessionState);
  const jobSnapshot = artifact.closureJob || {};
  const sessionMetadata = buildSessionMetadata(sessionState, jobSnapshot);

  const workflow = new StoryConsolidationWorkflow();
  const summaryRecord = await workflow.run({
    sessionId,
    transcript,
    sessionMetadata,
    safetyEvents
  });

  const extraction = extractEntities({
    transcript,
    sessionId
  });
  const mentions = Array.isArray(extraction?.mentions) ? extraction.mentions : [];

  const queue = new WorldDeltaQueue({
    canonState: {},
    publisher: {
      publishAlert(payload) {
        if (options.verbose) {
          // eslint-disable-next-line no-console
          console.log(
            JSON.stringify(
              {
                topic: "admin.alert",
                payload
              },
              null,
              2
            )
          );
        }
      }
    }
  });
  const deltas = queue.enqueueFromMentions(mentions) || [];

  const coordinator = new PublishingCoordinator();
  const publishingPlan = coordinator.prepareBatch({
    sessionId,
    sessionClosedAt: sessionState.closedAt || null,
    deltas,
    approvedBy: "qa.offline"
  });

  const qaResult = composeQaResult({
    sessionId,
    summaryRecord,
    mentions,
    deltas,
    publishingPlan,
    searchPlan: publishingPlan.searchPlan
  });

  return qaResult;
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    ensureDirectory(args.outputDir);

    const inputTargets = resolveInputTargets(args.input);
    const summaries = [];

    for (const target of inputTargets) {
      const runArgs = { ...args, input: target };
      const result = await executeOfflineQa(runArgs);
      const outputPath = path.join(
        args.outputDir,
        `${result.sessionId}-offline-qa.json`
      );
      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

      const moderationSummary = result.moderation || summarizeModeration(result.worldDeltas?.deltas);
      const summary = {
        sessionId: result.sessionId,
        sceneCount: result.summary.sceneBreakdown?.length || 0,
        mentionCount: result.entityExtraction.mentionCount,
        deltaCount: result.worldDeltas.deltaCount,
        batchId: result.publishing.preparedBatch?.batchId || null,
        scheduledRun:
          result.publishing.preparedBatch?.scheduledAt ||
          result.publishing.schedule?.batches?.[0]?.runAt ||
          null,
        outputPath,
        requiresModeration: Boolean(moderationSummary?.requiresModeration),
        moderationReasons: Array.isArray(moderationSummary?.reasons)
          ? moderationSummary.reasons
          : [],
        capabilityViolations: moderationSummary?.capabilityViolations || 0,
        conflictDetections: moderationSummary?.conflictDetections || 0,
        lowConfidenceDeltas: moderationSummary?.lowConfidenceFindings || 0
      };

      summaries.push(summary);
    }

    const payload =
      summaries.length === 1
        ? { status: "ok", summary: summaries[0] }
        : {
            status: "ok",
            summaries,
            rollup: composeBatchRollup(summaries)
          };

    if (payload.rollup) {
      const aggregatePath = path.join(
        args.outputDir,
        `offline-qa-batch-rollup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
      );
      fs.writeFileSync(aggregatePath, JSON.stringify(payload.rollup, null, 2));
      payload.rollupPath = aggregatePath;
    }

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(payload, null, 2));
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
  executeOfflineQa,
  sanitizeTranscript,
  collectSafetyEvents,
  buildSessionMetadata,
  resolveInputTargets,
  composeBatchRollup,
  summarizeModeration
};
