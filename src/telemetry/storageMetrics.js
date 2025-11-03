"use strict";

const { log } = require("../utils/logger");

class StorageMetrics {
  recordPolicyApplied(payload) {
    log("info", "telemetry.storage.policy.applied", sanitize(payload, ["bucket", "changed", "ruleCount"]));
  }

  recordBucketUsage(payload) {
    log(
      "info",
      "telemetry.storage.bucket.usage",
      sanitize(payload, [
        "bucket",
        "bytes",
        "objectCount",
        "oldestObjectAgeDays",
        "scanDurationMs",
        "capacityBytes",
        "capacityPercent"
      ])
    );
  }

  recordLifecycleDrift(payload) {
    log(
      "warn",
      "telemetry.storage.bucket.lifecycle_drift",
      sanitize(payload, ["bucket", "expectedArchiveDays", "observedAgeDays", "driftDays", "status"])
    );
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
  StorageMetrics
};
