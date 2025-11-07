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

class OfflineWorkflowMetrics {
  recordJobStarted(payload) {
    log(
      "info",
      "telemetry.offline.workflow.started",
      sanitize(payload, ["jobId", "sessionId", "attempt"])
    );
  }

  recordJobCompleted(payload) {
    log(
      "info",
      "telemetry.offline.workflow.completed",
      sanitize(payload, [
        "jobId",
        "sessionId",
        "durationMs",
        "summaryVersion",
        "mentionCount",
        "deltaCount"
      ])
    );
  }

  recordJobFailed(payload) {
    log(
      "error",
      "telemetry.offline.workflow.failed",
      sanitize(payload, ["jobId", "sessionId", "message"])
    );
  }

  recordLatency(payload) {
    log(
      "warn",
      "telemetry.offline.workflow.latency",
      sanitize(payload, ["jobId", "sessionId", "durationMs", "slaMs"])
    );
  }
}

export {
  OfflineWorkflowMetrics
};
