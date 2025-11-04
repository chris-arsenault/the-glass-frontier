"use strict";

const { PublishingCadence } = require("./publishingCadence");
const { PublishingStateStore } = require("./publishingStateStore");
const { BundleComposer } = require("./bundleComposer");
const { SearchSyncPlanner } = require("./searchSync");
const { PublishingMetrics } = require("../../telemetry/publishingMetrics");
const { summarizeModeration } = require("../moderation/moderationSummary");

class PublishingCoordinator {
  constructor(options = {}) {
    this.clock = options.clock || (() => new Date());
    this.metrics = options.metrics || new PublishingMetrics();

    const stateStore =
      options.stateStore || new PublishingStateStore({ clock: this.clock });

    this.cadence =
      options.cadence ||
      new PublishingCadence({ clock: this.clock, stateStore, config: options.config });
    this.composer =
      options.composer || new BundleComposer({ clock: this.clock, metrics: this.metrics });
    this.searchPlanner =
      options.searchPlanner || new SearchSyncPlanner({ metrics: this.metrics });
  }

  ensureSession({ sessionId, sessionClosedAt, config } = {}) {
    const existing = this.cadence.getSchedule(sessionId);
    if (existing) {
      return existing;
    }

    return this.cadence.planForSession({ sessionId, sessionClosedAt, config });
  }

  prepareBatch({
    sessionId,
    sessionClosedAt,
    batchId = null,
    deltas = [],
    moderationDecisionId = null,
    approvedBy = "admin.auto"
  } = {}) {
    if (!sessionId) {
      throw new Error("publishing_coordinator_requires_session");
    }

    const schedule = this.ensureSession({ sessionId, sessionClosedAt });
    const targetBatch = selectBatch(schedule, batchId);
    const moderation = summarizeModeration(deltas);
    const awaitingModeration = moderation.requiresModeration && !moderationDecisionId;

    if (awaitingModeration) {
      this.cadence.updateBatchStatus(sessionId, targetBatch.batchId, "awaiting_moderation", {
        deltaCount: deltas.length,
        notes: "moderation_gate_pending"
      });

      return {
        status: "awaiting_moderation",
        schedule: this.cadence.getSchedule(sessionId),
        publishing: null,
        searchPlan: { jobs: [], status: "blocked" },
        moderation
      };
    }

    const publishing = this.composer.compose({
      sessionId,
      batchId: targetBatch.batchId,
      deltas,
      scheduledAt: targetBatch.runAt,
      moderationDecisionId,
      approvedBy
    });

    this.cadence.updateBatchStatus(sessionId, targetBatch.batchId, "ready", {
      preparedAt: publishing.preparedAt,
      deltaCount: publishing.loreBundles.length
    });

    const searchPlan = this.searchPlanner.plan(publishing, {
      sessionId,
      batchId: targetBatch.batchId
    });
    searchPlan.status = "ready";

    return {
      status: "ready",
      schedule: this.cadence.getSchedule(sessionId),
      publishing,
      searchPlan,
      moderation
    };
  }

  markBatchPublished(sessionId, batchId, options = {}) {
    if (!sessionId || !batchId) {
      throw new Error("publishing_coordinator_requires_batch");
    }

    const schedule = this.cadence.getSchedule(sessionId);
    if (!schedule) {
      throw new Error("publishing_coordinator_unknown_session");
    }

    const targetBatch = selectBatch(schedule, batchId);
    const publishedAt = options.publishedAt ? new Date(options.publishedAt) : this.clock();
    if (Number.isNaN(publishedAt.getTime())) {
      throw new Error("publishing_coordinator_invalid_timestamp");
    }

    const runAt = new Date(targetBatch.runAt);
    const latencyMs = Math.max(0, publishedAt.getTime() - runAt.getTime());
    const deltaCount =
      options.deltaCount !== undefined ? options.deltaCount : targetBatch.deltaCount || 0;

    this.metrics.recordBatchPublished({
      sessionId,
      batchId,
      deltaCount,
      publishedAt: publishedAt.toISOString(),
      latencyMs
    });

    this.cadence.updateBatchStatus(sessionId, batchId, "published", {
      publishedAt,
      deltaCount,
      latencyMs
    });

    const drifts = this.searchPlanner.evaluate(options.searchResults || []);

    return {
      schedule: this.cadence.getSchedule(sessionId),
      drifts
    };
  }

  applyOverride(sessionId, override) {
    return this.cadence.applyOverride(sessionId, override);
  }

  getSchedule(sessionId) {
    return this.cadence.getSchedule(sessionId);
  }
}

function selectBatch(schedule, batchId) {
  if (!schedule?.batches || schedule.batches.length === 0) {
    throw new Error("publishing_coordinator_no_batches");
  }

  if (!batchId) {
    return schedule.batches[0];
  }

  const batch = schedule.batches.find((entry) => entry.batchId === batchId);
  if (!batch) {
    throw new Error("publishing_coordinator_batch_missing");
  }

  return batch;
}

module.exports = {
  PublishingCoordinator
};
