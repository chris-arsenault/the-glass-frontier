"use strict";

import { BaseEnvelope } from "./BaseEnvelope.js";

/**
 * Envelope for offline job lifecycle events
 * Corresponds to: offline.sessionClosure.queued, started, completed, failed
 */
class OfflineJobEvent extends BaseEnvelope {
  constructor(data, eventType) {
    const type = data.type || eventType || "offline.sessionClosure.queued";
    super(type, data, {
      id: data.id,
      markers: data.markers,
      turnSequence: data.turnSequence
    });

    this.jobId = data.jobId || null;
    this.status = this._determineStatus(type);
    this.enqueuedAt = data.enqueuedAt || null;
    this.startedAt = data.startedAt || null;
    this.completedAt = data.completedAt || null;
    this.durationMs = typeof data.durationMs === "number" ? data.durationMs : null;
    this.attempts = typeof data.attempts === "number" ? data.attempts : 0;
    this.error = data.error || null;
    this.result = data.result ? { ...data.result } : null;
  }

  _determineStatus(type) {
    if (type.includes("queued")) return "queued";
    if (type.includes("started")) return "processing";
    if (type.includes("completed")) return "completed";
    if (type.includes("failed")) return "failed";
    return "unknown";
  }

  serialize() {
    const envelope = {
      type: this.type,
      jobId: this.jobId,
      attempts: this.attempts
    };

    if (this.enqueuedAt) {
      envelope.enqueuedAt = this.enqueuedAt;
    }

    if (this.startedAt) {
      envelope.startedAt = this.startedAt;
    }

    if (this.completedAt) {
      envelope.completedAt = this.completedAt;
    }

    if (this.durationMs !== null) {
      envelope.durationMs = this.durationMs;
    }

    if (this.error) {
      envelope.error = typeof this.error === "string"
        ? { message: this.error }
        : this.error;
    }

    if (this.result) {
      envelope.result = this.result;
    }

    if (this.markers && this.markers.length > 0) {
      envelope.markers = this.markers;
    }

    return envelope;
  }

  static deserialize(data) {
    return new OfflineJobEvent(data);
  }

  static queued(jobId, attempts = 0) {
    return new OfflineJobEvent({
      type: "offline.sessionClosure.queued",
      jobId,
      attempts,
      enqueuedAt: new Date().toISOString()
    });
  }

  static started(jobId, attempts = 1) {
    return new OfflineJobEvent({
      type: "offline.sessionClosure.started",
      jobId,
      attempts,
      startedAt: new Date().toISOString()
    });
  }

  static completed(jobId, result = null, durationMs = null) {
    return new OfflineJobEvent({
      type: "offline.sessionClosure.completed",
      jobId,
      result,
      durationMs,
      completedAt: new Date().toISOString()
    });
  }

  static failed(jobId, error, durationMs = null) {
    return new OfflineJobEvent({
      type: "offline.sessionClosure.failed",
      jobId,
      error,
      durationMs,
      completedAt: new Date().toISOString()
    });
  }

  validate() {
    super.validate();

    if (!this.jobId) {
      throw new Error("OfflineJobEvent must have a jobId");
    }

    return true;
  }
}

export { OfflineJobEvent };
