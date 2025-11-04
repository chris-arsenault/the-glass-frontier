"use strict";

const { v4: uuid } = require("uuid");
const { PublishingMetrics } = require("../../telemetry/publishingMetrics");

const FIVE_MINUTES_MS = 5 * 60 * 1000;

class SearchSyncRetryQueue {
  constructor(options = {}) {
    this.clock = options.clock || (() => new Date());
    this.metrics = options.metrics || new PublishingMetrics();
    this.baseDelayMs = Number.isFinite(options.baseDelayMs) ? options.baseDelayMs : FIVE_MINUTES_MS;
    this.maxAttempts = Number.isFinite(options.maxAttempts) ? options.maxAttempts : 3;
    this.jobs = [];
  }

  enqueue({ sessionId, batchId, drift, attempt = 1 } = {}) {
    if (!drift || !drift.jobId) {
      throw new Error("search_retry_queue_requires_job");
    }

    const effectiveAttempt = Math.max(1, Math.min(attempt, this.maxAttempts));
    const retryDelayMs = this.baseDelayMs * Math.pow(2, effectiveAttempt - 1);
    const retryAt = new Date(this.clock().getTime() + retryDelayMs);

    const job = {
      retryId: `search-retry-${uuid().slice(0, 8)}`,
      sessionId: sessionId || null,
      batchId: batchId || null,
      jobId: drift.jobId,
      index: drift.index || null,
      documentId: drift.documentId || null,
      attempt: effectiveAttempt,
      retryAt: retryAt.toISOString(),
      reason: drift.reason || "unknown",
      payload: { ...drift }
    };

    this.jobs.push(job);
    this.metrics.recordSearchRetryQueued({
      sessionId: job.sessionId,
      batchId: job.batchId,
      jobId: job.jobId,
      index: job.index,
      documentId: job.documentId,
      attempt: job.attempt,
      retryAt: job.retryAt,
      reason: job.reason
    });

    return { ...job };
  }

  getPending() {
    return this.jobs.map((job) => ({ ...job }));
  }

  summarize() {
    const jobs = this.getPending();
    let nextRetryAt = null;
    if (jobs.length > 0) {
      nextRetryAt = jobs.reduce((earliest, job) => {
        if (!earliest) {
          return job.retryAt || null;
        }
        if (!job.retryAt) {
          return earliest;
        }
        return job.retryAt < earliest ? job.retryAt : earliest;
      }, null);
    }

    return {
      pendingCount: jobs.length,
      status: jobs.length > 0 ? "pending" : "clear",
      nextRetryAt,
      jobs
    };
  }

  drain() {
    const pending = this.getPending();
    this.jobs = [];
    return pending;
  }
}

module.exports = {
  SearchSyncRetryQueue
};
