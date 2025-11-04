"use strict";

const { StoryConsolidationWorkflow } = require("./storyConsolidation/storyConsolidationWorkflow");
const { extractEntities } = require("./entityExtraction/entityExtractor");
const { WorldDeltaQueue } = require("./delta/worldDeltaQueue");
const { PublishingCoordinator } = require("./publishing/publishingCoordinator");
const { OfflineWorkflowMetrics } = require("../telemetry/offlineMetrics");
const { log } = require("../utils/logger");

function ensureArray(candidate) {
  if (!candidate) {
    return [];
  }
  return Array.isArray(candidate) ? candidate : [candidate];
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

function buildSessionMetadata(sessionState, job) {
  const momentum = sessionState?.momentum || sessionState?.shards?.momentum?.data || {};
  const character = sessionState?.character || sessionState?.shards?.character?.data || {};
  const location = sessionState?.location || {};
  const closure = {
    auditRef: job.auditRef,
    reason: job.reason,
    closedAt: job.closedAt,
    trigger: job.trigger,
    pendingChecks: job.pendingChecks
  };

  return {
    character,
    location,
    momentum,
    closure,
    scenes: ensureArray(sessionState?.scenes),
    tags: ensureArray(sessionState?.labels)
  };
}

function collectSafetyEvents(sessionState) {
  const changes = Array.isArray(sessionState?.changeFeed) ? sessionState.changeFeed : [];
  return changes
    .filter((entry) => Array.isArray(entry.safetyFlags) && entry.safetyFlags.length > 0)
    .map((entry) => ({
      shard: entry.shard,
      safetyFlags: entry.safetyFlags,
      capabilityRefs: entry.capabilityRefs || [],
      timestamp: entry.timestamp || null,
      reason: entry.reason || null
    }));
}

class ClosureWorkflowOrchestrator {
  constructor(options = {}) {
    if (!options.coordinator) {
      throw new Error("closure_orchestrator_requires_coordinator");
    }
    if (!options.sessionMemory) {
      throw new Error("closure_orchestrator_requires_session_memory");
    }

    this.coordinator = options.coordinator;
    this.sessionMemory = options.sessionMemory;
    this.checkBus = options.checkBus || {
      emitAdminAlert(payload) {
        log("warn", "offline.workflow.adminAlert", payload);
        return payload;
      }
    };
    this.clock = options.clock || (() => new Date());
    this.metrics = options.metrics || new OfflineWorkflowMetrics();
    this.storyConsolidation =
      options.storyConsolidationWorkflow ||
      new StoryConsolidationWorkflow({
        clock: this.clock
      });
    this.entityExtractor =
      options.entityExtractor ||
      ((extractorOptions) => extractEntities(extractorOptions));
    this.createDeltaQueue =
      options.createDeltaQueue ||
      (() => new WorldDeltaQueue(options.deltaQueueOptions || {}));
    this.publishingCoordinator =
      options.publishingCoordinator ||
      new PublishingCoordinator({
        clock: this.clock
      });
    this.slaDurationMs =
      typeof options.slaDurationMs === "number" && options.slaDurationMs > 0
        ? options.slaDurationMs
        : 10 * 60 * 1000;

    this.processingJobs = new Set();
    this.unsubscribe = null;
  }

  start() {
    if (this.unsubscribe) {
      return;
    }

    const queued = this.coordinator
      .listJobs()
      .filter((job) => job.status === "queued")
      .map((job) => job.jobId);
    queued.forEach((jobId) => this.#schedule(jobId));

    this.unsubscribe = this.coordinator.onJobQueued((job) => {
      this.#schedule(job.jobId);
    });
  }

  stop() {
    if (typeof this.unsubscribe === "function") {
      this.unsubscribe();
    }
    this.unsubscribe = null;
  }

  async run(jobId) {
    await this.#runJob(jobId);
  }

  #schedule(jobId) {
    if (!jobId || this.processingJobs.has(jobId)) {
      return;
    }

    this.processingJobs.add(jobId);
    Promise.resolve()
      .then(() => this.#runJob(jobId))
      .catch((error) => {
        log("error", "ClosureWorkflowOrchestrator run failed", {
          jobId,
          message: error.message
        });
      })
      .finally(() => {
        this.processingJobs.delete(jobId);
      });
  }

  async #runJob(jobId) {
    const snapshot = this.coordinator.getJob(jobId);
    if (!snapshot || snapshot.status !== "queued") {
      return;
    }

    const job = this.coordinator.startJob(jobId);
    this.metrics.recordJobStarted({
      jobId: job.jobId,
      sessionId: job.sessionId,
      attempt: job.attempts
    });

    try {
      const sessionState = this.sessionMemory.getSessionState(job.sessionId);
      const transcript = sanitizeTranscript(sessionState.transcript || []);
      const sessionMetadata = buildSessionMetadata(sessionState, job);
      const safetyEvents = collectSafetyEvents(sessionState);

      const summaryRecord = await this.storyConsolidation.run({
        sessionId: job.sessionId,
        transcript,
        sessionMetadata,
        safetyEvents
      });

      const extraction = this.entityExtractor({
        transcript,
        sessionId: job.sessionId
      }) || { mentions: [] };
      const mentions = Array.isArray(extraction.mentions) ? extraction.mentions : [];

      const deltaQueue = this.createDeltaQueue({
        sessionId: job.sessionId,
        job,
        sessionState
      });
      const generatedDeltas = deltaQueue.enqueueFromMentions(mentions);
      const deltas = Array.isArray(generatedDeltas) ? generatedDeltas : [];

      const publishingPlan = this.publishingCoordinator.prepareBatch({
        sessionId: job.sessionId,
        sessionClosedAt: job.closedAt,
        deltas,
        approvedBy: "system.offline"
      });
      const batchInfo =
        (publishingPlan.schedule && Array.isArray(publishingPlan.schedule.batches)
          ? publishingPlan.schedule.batches[0]
          : null) || {};
      const moderationSummary = publishingPlan.moderation || null;

      const completedJob = this.coordinator.completeJob(job.jobId, {
        summaryVersion: summaryRecord.version,
        mentionCount: mentions.length,
        deltaCount: deltas.length,
        publishing: {
          batchId: batchInfo.batchId || null,
          scheduledAt: batchInfo.runAt || null,
          status: publishingPlan.status || null,
          moderation: moderationSummary
        },
        searchJobs: publishingPlan.searchPlan?.jobs || []
      });

      const completedAtIso = completedJob.completedAt || toIsoTimestamp();
      const durationMs =
        completedJob.durationMs ?? this.#computeDuration(job.startedAt, completedAtIso);

      this.sessionMemory.recordOfflineWorkflowRun(job.sessionId, {
        jobId: job.jobId,
        auditRef: job.auditRef,
        status: "completed",
        startedAt: job.startedAt,
        completedAt: completedAtIso,
        durationMs,
        summaryVersion: summaryRecord.version,
        mentionCount: mentions.length,
        deltaCount: deltas.length,
        publishingBatchId: batchInfo.batchId || null,
        publishingStatus: publishingPlan.status || null,
        requiresModeration: Boolean(moderationSummary?.requiresModeration),
        moderationReasons: Array.isArray(moderationSummary?.reasons)
          ? moderationSummary.reasons
          : [],
        moderationCapabilityViolations: moderationSummary?.capabilityViolations || 0,
        moderationConflictDetections: moderationSummary?.conflictDetections || 0,
        moderationLowConfidence: moderationSummary?.lowConfidenceFindings || 0
      });

      this.sessionMemory.markOfflineReconciled(job.sessionId, {
        reconciledAt: completedAtIso,
        workflowJobId: job.jobId,
        summaryVersion: summaryRecord.version,
        durationMs
      });

      this.metrics.recordJobCompleted({
        jobId: job.jobId,
        sessionId: job.sessionId,
        durationMs,
        summaryVersion: summaryRecord.version,
        mentionCount: mentions.length,
        deltaCount: deltas.length
      });

      if (typeof durationMs === "number" && durationMs > this.slaDurationMs) {
        this.metrics.recordLatency({
          jobId: job.jobId,
          sessionId: job.sessionId,
          durationMs,
          slaMs: this.slaDurationMs
        });
        this.checkBus.emitAdminAlert({
          sessionId: job.sessionId,
          reason: "offline.workflow_sla_exceeded",
          severity: "medium",
          data: {
            jobId: job.jobId,
            durationMs,
            slaMs: this.slaDurationMs
          }
        });
      }
    } catch (error) {
      const failedJob = this.coordinator.failJob(job.jobId, error);
      this.sessionMemory.recordOfflineWorkflowRun(job.sessionId, {
        jobId: job.jobId,
        auditRef: job.auditRef,
        status: "failed",
        startedAt: failedJob.startedAt,
        completedAt: failedJob.completedAt,
        durationMs: failedJob.durationMs,
        error: error.message
      });

      this.metrics.recordJobFailed({
        jobId: job.jobId,
        sessionId: job.sessionId,
        message: error.message
      });

      this.checkBus.emitAdminAlert({
        sessionId: job.sessionId,
        reason: "offline.workflow_failed",
        severity: "critical",
        data: {
          jobId: job.jobId,
          message: error.message
        }
      });

      log("error", "ClosureWorkflowOrchestrator job failed", {
        jobId: job.jobId,
        sessionId: job.sessionId,
        message: error.message
      });
    }
  }

  #computeDuration(startedAt, completedAt) {
    const start = startedAt instanceof Date ? startedAt : new Date(startedAt);
    const end = completedAt instanceof Date ? completedAt : new Date(completedAt);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return null;
    }

    return Math.max(0, end.getTime() - start.getTime());
  }
}

function toIsoTimestamp(value) {
  if (!value) {
    return new Date().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return new Date().toISOString();
}

module.exports = {
  ClosureWorkflowOrchestrator
};
