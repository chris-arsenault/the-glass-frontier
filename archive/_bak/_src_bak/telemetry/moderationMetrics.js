"use strict";

import { log  } from "../utils/logger.js";

function sanitize(source, fields) {
  if (!source) {
    return {};
  }

  return fields.reduce((accumulator, field) => {
    if (Object.prototype.hasOwnProperty.call(source, field) && source[field] !== undefined) {
      accumulator[field] = source[field];
    }
    return accumulator;
  }, {});
}

class ModerationMetrics {
  recordTemporalSyncAttempt(payload) {
    log(
      "info",
      "telemetry.moderation.temporal.attempt",
      sanitize(payload, ["sessionId", "attempt"])
    );
  }

  recordTemporalSyncSuccess(payload) {
    log(
      "info",
      "telemetry.moderation.temporal.success",
      sanitize(payload, ["sessionId", "attempt", "durationMs"])
    );
  }

  recordTemporalSyncFailure(payload) {
    log(
      "error",
      "telemetry.moderation.temporal.failure",
      sanitize(payload, [
        "sessionId",
        "attempt",
        "durationMs",
        "message",
        "code",
        "status",
        "willRetry"
      ])
    );
  }

  recordTemporalSyncRetryScheduled(payload) {
    log(
      "warn",
      "telemetry.moderation.temporal.retryScheduled",
      sanitize(payload, ["sessionId", "attempt", "retryAt", "backoffMs", "reason"])
    );
  }

  recordTemporalSyncGiveUp(payload) {
    log(
      "error",
      "telemetry.moderation.temporal.giveUp",
      sanitize(payload, ["sessionId", "attempts", "message", "code", "status"])
    );
  }
}

export {
  ModerationMetrics
};
