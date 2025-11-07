"use strict";

import { log  } from "../utils/logger.js";
import otel from "./storageMetricsOtel";

class StorageMetrics {
  async flush() {
    if (otel && typeof otel.flush === "function") {
      await otel.flush();
    }
  }

  async shutdown() {
    if (otel && typeof otel.shutdown === "function") {
      await otel.shutdown();
    }
  }

  recordPolicyApplied(payload) {
    const sanitized = sanitize(payload, ["bucket", "changed", "ruleCount"]);
    log("info", "telemetry.storage.policy.applied", sanitized);
    if (otel && typeof otel.recordPolicyApplied === "function") {
      otel.recordPolicyApplied(sanitized);
    }
  }

  recordBucketUsage(payload) {
    const sanitized = sanitize(payload, [
      "bucket",
      "bytes",
      "objectCount",
      "oldestObjectAgeDays",
      "scanDurationMs",
      "capacityBytes",
      "capacityPercent"
    ]);
    log("info", "telemetry.storage.bucket.usage", sanitized);
    if (otel && typeof otel.recordBucketUsage === "function") {
      otel.recordBucketUsage(sanitized);
    }
  }

  recordLifecycleDrift(payload) {
    const sanitized = sanitize(payload, ["bucket", "expectedArchiveDays", "observedAgeDays", "driftDays", "status"]);
    log("warn", "telemetry.storage.bucket.lifecycle_drift", sanitized);
    if (otel && typeof otel.recordLifecycleDrift === "function") {
      otel.recordLifecycleDrift({
        bucket: sanitized.bucket,
        driftDays: sanitized.driftDays,
        status: sanitized.status
      });
    }
  }

  recordRemoteTierStatus(payload) {
    const sanitized = sanitize(payload, [
      "bucket",
      "objectKey",
      "storageClass",
      "status",
      "bytes",
      "writeDurationMs",
      "fetchDurationMs",
      "error"
    ]);
    log("info", "telemetry.storage.remote_tier.rehearsal", sanitized);
    if (otel && typeof otel.recordRemoteTierStatus === "function") {
      otel.recordRemoteTierStatus(sanitized);
    }
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

export {
  StorageMetrics
};
