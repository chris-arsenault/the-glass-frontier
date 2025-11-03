"use strict";

const { v4: uuid } = require("uuid");
const { log } = require("../utils/logger");

function createLoggingPublisher() {
  return {
    publish(topic, payload) {
      log("info", topic, payload);
    }
  };
}

function toIso(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return new Date().toISOString();
}

function cloneJob(job) {
  return JSON.parse(JSON.stringify(job));
}

class SessionClosureCoordinator {
  constructor({ publisher, clock } = {}) {
    this.publisher = publisher || createLoggingPublisher();
    this.clock = clock || (() => new Date());
    this.queue = new Map();
    this.listeners = new Set();
  }

  onJobQueued(listener) {
    if (typeof listener !== "function") {
      throw new Error("closure_coordinator_requires_listener");
    }

    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  enqueueClosure(request = {}) {
    if (!request.sessionId) {
      throw new Error("closure_coordinator_requires_session_id");
    }

    const enqueuedAt = this.#now();
    const job = {
      jobId: uuid(),
      sessionId: request.sessionId,
      trigger: request.trigger || "session_closed",
      status: "queued",
      enqueuedAt,
      startedAt: null,
      completedAt: null,
      durationMs: null,
      attempts: 0,
      auditRef: request.auditRef || null,
      reason: request.reason || null,
      closedAt: request.closedAt ? toIso(request.closedAt) : enqueuedAt,
      momentum: request.momentum || {},
      changeCursor:
        typeof request.changeCursor === "number" ? request.changeCursor : null,
      lastAckCursor:
        typeof request.lastAckCursor === "number" ? request.lastAckCursor : null,
      pendingChecks: Array.isArray(request.pendingChecks) ? request.pendingChecks.length : 0,
      result: null,
      error: null
    };

    this.queue.set(job.jobId, job);
    this.#publish("offline.sessionClosure.queued", {
      jobId: job.jobId,
      sessionId: job.sessionId,
      trigger: job.trigger,
      auditRef: job.auditRef,
      enqueuedAt: job.enqueuedAt
    });
    this.#dispatch(job);

    return job;
  }

  startJob(jobId) {
    const job = this.queue.get(jobId);
    if (!job) {
      throw new Error("closure_coordinator_unknown_job");
    }

    if (job.status === "processing") {
      return job;
    }

    const startedAt = this.#now();
    job.status = "processing";
    job.startedAt = startedAt;
    job.completedAt = null;
    job.durationMs = null;
    job.attempts += 1;
    job.error = null;
    job.result = null;

    this.#publish("offline.sessionClosure.started", {
      jobId: job.jobId,
      sessionId: job.sessionId,
      startedAt,
      attempts: job.attempts
    });

    return job;
  }

  completeJob(jobId, result = {}) {
    const job = this.queue.get(jobId);
    if (!job) {
      throw new Error("closure_coordinator_unknown_job");
    }

    const completedAt = this.#now();
    job.status = "completed";
    job.completedAt = completedAt;
    job.durationMs = this.#computeDuration(job.startedAt, completedAt);
    job.result = result || {};
    job.error = null;

    this.#publish("offline.sessionClosure.completed", {
      jobId: job.jobId,
      sessionId: job.sessionId,
      completedAt,
      durationMs: job.durationMs
    });

    return job;
  }

  failJob(jobId, error) {
    const job = this.queue.get(jobId);
    if (!job) {
      throw new Error("closure_coordinator_unknown_job");
    }

    const completedAt = this.#now();
    job.status = "failed";
    job.completedAt = completedAt;
    job.durationMs = this.#computeDuration(job.startedAt, completedAt);
    job.result = null;
    job.error = {
      message: error?.message || String(error || "workflow_failed"),
      code: error?.code || null
    };

    this.#publish("offline.sessionClosure.failed", {
      jobId: job.jobId,
      sessionId: job.sessionId,
      completedAt,
      durationMs: job.durationMs,
      message: job.error.message
    });

    return job;
  }

  getJob(jobId) {
    return this.queue.get(jobId) || null;
  }

  listJobs() {
    return Array.from(this.queue.values()).map((job) => cloneJob(job));
  }

  #computeDuration(startedAt, completedAt) {
    if (!startedAt || !completedAt) {
      return null;
    }

    const start = new Date(startedAt);
    const end = new Date(completedAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return null;
    }
    return Math.max(0, end.getTime() - start.getTime());
  }

  #now() {
    const timestamp = this.clock();
    return timestamp instanceof Date ? timestamp.toISOString() : new Date().toISOString();
  }

  #publish(topic, payload) {
    if (typeof this.publisher?.publish === "function") {
      this.publisher.publish(topic, payload);
    }
  }

  #dispatch(job) {
    if (this.listeners.size === 0) {
      return;
    }

    const cloned = cloneJob(job);
    this.listeners.forEach((listener) => {
      Promise.resolve()
        .then(() => listener(cloned))
        .catch((error) => {
          log("error", "SessionClosureCoordinator listener failed", {
            jobId: job.jobId,
            message: error.message
          });
        });
    });
  }
}

module.exports = {
  SessionClosureCoordinator
};
