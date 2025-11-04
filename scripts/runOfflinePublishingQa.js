"use strict";

const fs = require("fs");
const path = require("path");
const {
  storyConsolidation: { StoryConsolidationWorkflow },
  entityExtraction: { extractEntities },
  delta: { WorldDeltaQueue },
  publishing: { PublishingCoordinator, SearchSyncRetryQueue }
} = require("../src/offline");
const {
  summarizeModeration
} = require("../src/offline/moderation/moderationSummary");

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
    verbose: false,
    simulateSearchDrift: false
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
    if (token === "--simulate-search-drift") {
      options.simulateSearchDrift = true;
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

function composeQaResult({ sessionId, summaryRecord, mentions, deltas, publishingPlan }) {
  const moderationSummary = publishingPlan?.moderation || summarizeModeration(deltas);
  const publishingStatus =
    publishingPlan?.status ||
    (moderationSummary.requiresModeration ? "awaiting_moderation" : "ready");

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
      status: publishingStatus,
      schedule: publishingPlan?.schedule || null,
      preparedBatch: publishingPlan?.publishing || null,
      searchPlan: publishingPlan?.searchPlan || null,
      moderation: moderationSummary,
      retryQueue: publishingPlan?.retryQueue || null
    },
    moderation: moderationSummary
  };
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

function synthesizeSearchResults(searchPlan = {}, simulateDrift = false) {
  const jobs = Array.isArray(searchPlan?.jobs) ? searchPlan.jobs : [];
  if (jobs.length === 0) {
    return [];
  }

  return jobs.map((job) => {
    const expectedVersion =
      typeof job.expectedVersion === "number" ? job.expectedVersion : 1;

    if (simulateDrift) {
      return {
        index: job.index || null,
        documentId: job.documentId || null,
        status: "failure",
        expectedVersion,
        actualVersion: Math.max(0, expectedVersion - 1)
      };
    }

    return {
      index: job.index || null,
      documentId: job.documentId || null,
      status: "success",
      expectedVersion,
      actualVersion: expectedVersion
    };
  });
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

  const retryQueue = new SearchSyncRetryQueue();
  const coordinator = new PublishingCoordinator({ retryQueue });
  const publishingPlan = coordinator.prepareBatch({
    sessionId,
    sessionClosedAt: sessionState.closedAt || null,
    deltas,
    approvedBy: "qa.offline"
  });

  const enhancedPublishingPlan = publishingPlan
    ? JSON.parse(JSON.stringify(publishingPlan))
    : { status: "ready", searchPlan: { status: "ready", jobs: [] } };

  const batchId =
    enhancedPublishingPlan?.schedule?.batches?.[0]?.batchId || null;

  let publicationResult = null;
  let retryQueueBeforeDrain = retryQueue.summarize();
  let retryQueueAfterDrain = retryQueueBeforeDrain;
  let drainedRetryJobs = [];

  if (batchId) {
    const searchResults = synthesizeSearchResults(
      enhancedPublishingPlan.searchPlan,
      options.simulateSearchDrift
    );

    publicationResult = coordinator.markBatchPublished(sessionId, batchId, {
      searchResults
    });

    retryQueueBeforeDrain =
      publicationResult?.retrySummary || retryQueue.summarize();

    if (options.simulateSearchDrift) {
      drainedRetryJobs = retryQueue.drain();
      retryQueueAfterDrain = retryQueue.summarize();
    } else {
      retryQueueAfterDrain = retryQueueBeforeDrain;
    }
  }

  const retryStatusAfterDrain =
    (retryQueueAfterDrain.pendingCount || 0) > 0 ? "pending" : "clear";

  const publishingStatus =
    retryStatusAfterDrain === "pending"
      ? "retry_pending"
      : publicationResult
      ? "published"
      : enhancedPublishingPlan.status || "ready";

  const searchPlanStatus =
    retryStatusAfterDrain === "pending"
      ? "retry_pending"
      : publicationResult
      ? "published"
      : enhancedPublishingPlan.searchPlan?.status || "ready";

  enhancedPublishingPlan.status = publishingStatus;
  enhancedPublishingPlan.searchPlan = Object.assign(
    {},
    enhancedPublishingPlan.searchPlan || {},
    {
      status: searchPlanStatus,
      retrySummary:
        publicationResult?.retrySummary || retryQueueAfterDrain || {
          pendingCount: 0,
          status: "clear",
          nextRetryAt: null,
          jobs: []
        }
    }
  );
  enhancedPublishingPlan.retryQueue = {
    status: retryStatusAfterDrain,
    beforeDrain: retryQueueBeforeDrain,
    afterDrain: retryQueueAfterDrain,
    drainedJobs: drainedRetryJobs
  };

  const qaResult = composeQaResult({
    sessionId,
    summaryRecord,
    mentions,
    deltas,
    publishingPlan: enhancedPublishingPlan
  });

  qaResult.publishing.retryQueue = enhancedPublishingPlan.retryQueue;

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

      const moderationSummary =
        result.publishing?.moderation ||
        result.moderation ||
        summarizeModeration(result.worldDeltas?.deltas);
      const summary = {
        sessionId: result.sessionId,
        sceneCount: result.summary.sceneBreakdown?.length || 0,
        mentionCount: result.entityExtraction.mentionCount,
        deltaCount: result.worldDeltas.deltaCount,
        publishingStatus: result.publishing.status || "unknown",
        batchId:
          result.publishing.preparedBatch?.batchId ||
          result.publishing.schedule?.batches?.[0]?.batchId ||
          null,
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
  composeBatchRollup
};
