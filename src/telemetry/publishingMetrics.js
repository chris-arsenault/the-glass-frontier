"use strict";

const { log } = require("../utils/logger");

class PublishingMetrics {
  recordBatchPrepared(payload) {
    log("info", "telemetry.publish.batch.prepared", sanitize(payload, ["sessionId", "batchId", "deltaCount", "scheduledAt"]));
  }

  recordBatchPublished(payload) {
    log("info", "telemetry.publish.batch.published", sanitize(payload, ["sessionId", "batchId", "deltaCount", "publishedAt", "latencyMs"]));
  }

  recordDigestPublished(payload) {
    log("info", "telemetry.publish.digest.published", sanitize(payload, ["date", "sectionCount", "publishedAt", "latencyMs"]));
  }

  recordSearchSyncPlanned(payload) {
    log("info", "telemetry.search.sync.planned", sanitize(payload, ["sessionId", "batchId", "jobCount"]));
  }

  recordSearchDrift(payload) {
    log("warn", "telemetry.search.drift", sanitize(payload, ["index", "documentId", "reason", "expectedVersion", "actualVersion"]));
  }

  recordSearchError(payload) {
    log("error", "telemetry.search.error", sanitize(payload, ["index", "documentId", "message"]));
  }
}

function sanitize(source, allowedKeys) {
  const output = {};
  allowedKeys.forEach((key) => {
    if (source && Object.prototype.hasOwnProperty.call(source, key)) {
      output[key] = source[key];
    }
  });
  return output;
}

module.exports = {
  PublishingMetrics
};
