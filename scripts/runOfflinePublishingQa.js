"use strict";

const fs = require("fs");
const path = require("path");
const {
  storyConsolidation: { StoryConsolidationWorkflow },
  entityExtraction: { extractEntities },
  delta: { WorldDeltaQueue },
  publishing: { PublishingCoordinator }
} = require("../src/offline");

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
    }
  };
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

    const result = await executeOfflineQa(args);
    const outputPath = path.join(
      args.outputDir,
      `${result.sessionId}-offline-qa.json`
    );
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

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
      outputPath
    };

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ status: "ok", summary }, null, 2));
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
  buildSessionMetadata
};
