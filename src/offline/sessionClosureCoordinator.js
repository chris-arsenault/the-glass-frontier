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

class SessionClosureCoordinator {
  constructor({ publisher } = {}) {
    this.publisher = publisher || createLoggingPublisher();
    this.queue = new Map();
  }

  enqueueClosure(request = {}) {
    if (!request.sessionId) {
      throw new Error("closure_coordinator_requires_session_id");
    }

    const enqueuedAt = new Date().toISOString();
    const job = {
      jobId: uuid(),
      sessionId: request.sessionId,
      trigger: request.trigger || "session_closed",
      status: "queued",
      enqueuedAt,
      auditRef: request.auditRef || null,
      reason: request.reason || null,
      closedAt: request.closedAt || enqueuedAt,
      momentum: request.momentum || {},
      changeCursor:
        typeof request.changeCursor === "number" ? request.changeCursor : null,
      lastAckCursor:
        typeof request.lastAckCursor === "number" ? request.lastAckCursor : null,
      pendingChecks: Array.isArray(request.pendingChecks) ? request.pendingChecks.length : 0
    };

    this.queue.set(job.jobId, job);
    this.publisher.publish("offline.sessionClosure.queued", {
      jobId: job.jobId,
      sessionId: job.sessionId,
      trigger: job.trigger,
      auditRef: job.auditRef,
      enqueuedAt: job.enqueuedAt
    });

    return job;
  }

  getJob(jobId) {
    return this.queue.get(jobId) || null;
  }

  listJobs() {
    return Array.from(this.queue.values());
  }
}

module.exports = {
  SessionClosureCoordinator
};
