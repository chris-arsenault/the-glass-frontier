"use strict";

let MeterProvider;
let PeriodicExportingMetricReader;
let OTLPMetricExporter;
try {
  ({ MeterProvider, PeriodicExportingMetricReader } = require("@opentelemetry/sdk-metrics"));
  ({ OTLPMetricExporter } = require("@opentelemetry/exporter-metrics-otlp-http"));
} catch (error) {
  // Optional dependency: when modules are unavailable we fall back to no-ops.
}

const bucketUsageState = new Map();
const lifecycleDriftState = new Map();

let meterProvider = null;
let meter = null;
let metricReader = null;
let policyAppliedCounter = null;
let remoteTierCounter = null;
let remoteTierWriteHistogram = null;
let remoteTierFetchHistogram = null;
let remoteTierBytesHistogram = null;

function resolveEndpoint() {
  return (
    process.env.STORAGE_METRICS_OTLP_ENDPOINT ||
    process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT ||
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
    null
  );
}

function resolveServiceName() {
  return process.env.STORAGE_METRICS_SERVICE_NAME || "storage-lifecycle";
}

function ensureMeter() {
  if (meter) {
    return meter;
  }

  if (!MeterProvider || !PeriodicExportingMetricReader || !OTLPMetricExporter) {
    return null;
  }

  const endpoint = resolveEndpoint();
  if (!endpoint) {
    return null;
  }

  meterProvider = new MeterProvider({
    resource: undefined
  });

  const exporter = new OTLPMetricExporter({
    url: endpoint
  });

  metricReader = new PeriodicExportingMetricReader({
    exporter,
    exportIntervalMillis: Number(process.env.STORAGE_METRICS_EXPORT_INTERVAL_MS) || 15000
  });

  meterProvider.addMetricReader(metricReader);
  meter = meterProvider.getMeter("storage-metrics");

  registerObservables();
  registerCounters();

  return meter;
}

function registerObservables() {
  if (!meter) {
    return;
  }

  meter.createObservableGauge(
    "telemetry_storage_bucket_usage_bytes",
    {
      description: "Latest observed byte usage for MinIO buckets"
    },
    (observableResult) => {
      for (const [bucket, payload] of bucketUsageState.entries()) {
        if (typeof payload.bytes === "number") {
          observableResult.observe(payload.bytes, { bucket, service: resolveServiceName() });
        }
      }
    }
  );

  meter.createObservableGauge(
    "telemetry_storage_bucket_usage_objectCount",
    {
      description: "Object count reported by lifecycle scans"
    },
    (observableResult) => {
      for (const [bucket, payload] of bucketUsageState.entries()) {
        if (typeof payload.objectCount === "number") {
          observableResult.observe(payload.objectCount, { bucket, service: resolveServiceName() });
        }
      }
    }
  );

  meter.createObservableGauge(
    "telemetry_storage_bucket_usage_capacityBytes",
    {
      description: "Configured capacity thresholds for lifecycle monitoring"
    },
    (observableResult) => {
      for (const [bucket, payload] of bucketUsageState.entries()) {
        if (typeof payload.capacityBytes === "number") {
          observableResult.observe(payload.capacityBytes, { bucket, service: resolveServiceName() });
        }
      }
    }
  );

  meter.createObservableGauge(
    "telemetry_storage_bucket_usage_capacityPercent",
    {
      description: "Percent of bucket capacity consumed"
    },
    (observableResult) => {
      for (const [bucket, payload] of bucketUsageState.entries()) {
        if (typeof payload.capacityPercent === "number") {
          observableResult.observe(payload.capacityPercent, { bucket, service: resolveServiceName() });
        }
      }
    }
  );

  meter.createObservableGauge(
    "telemetry_storage_bucket_lifecycle_drift_driftDays",
    {
      description: "Days of drift between expected archive transition and observed oldest object age"
    },
    (observableResult) => {
      for (const [bucket, payload] of lifecycleDriftState.entries()) {
        if (typeof payload.driftDays === "number") {
          observableResult.observe(payload.driftDays, {
            bucket,
            status: payload.status || "unknown",
            service: resolveServiceName()
          });
        }
      }
    }
  );
}

function registerCounters() {
  if (!meter) {
    return;
  }

  policyAppliedCounter = meter.createCounter("telemetry_storage_policy_applied_total", {
    description: "Lifecycle policy applications performed by automation",
    unit: "1"
  });

  remoteTierCounter = meter.createCounter("telemetry_storage_remote_tier_rehearsal_total", {
    description: "Remote tier rehearsal attempts grouped by outcome",
    unit: "1"
  });

  remoteTierWriteHistogram = meter.createHistogram("telemetry_storage_remote_tier_write_duration_ms", {
    description: "Write duration for remote tier rehearsal objects",
    unit: "ms"
  });

  remoteTierFetchHistogram = meter.createHistogram("telemetry_storage_remote_tier_fetch_duration_ms", {
    description: "Fetch duration for remote tier rehearsal objects",
    unit: "ms"
  });

  remoteTierBytesHistogram = meter.createHistogram("telemetry_storage_remote_tier_bytes", {
    description: "Size of rehearsal payloads",
    unit: "By"
  });
}

function recordPolicyApplied(payload) {
  if (!ensureMeter()) {
    return;
  }

  const bucket = payload.bucket || "unknown";
  const changed = payload.changed === true ? "changed" : "unchanged";

  policyAppliedCounter.add(1, {
    bucket,
    outcome: changed,
    service: resolveServiceName()
  });
}

function recordBucketUsage(payload) {
  if (!ensureMeter()) {
    return;
  }

  if (!payload || !payload.bucket) {
    return;
  }

  bucketUsageState.set(payload.bucket, {
    bucket: payload.bucket,
    bytes: toNumberOrNull(payload.bytes),
    objectCount: toNumberOrNull(payload.objectCount),
    capacityPercent: toNumberOrNull(payload.capacityPercent),
    capacityBytes: toNumberOrNull(payload.capacityBytes)
  });
}

function recordLifecycleDrift(payload) {
  if (!ensureMeter()) {
    return;
  }

  if (!payload || !payload.bucket) {
    return;
  }

  lifecycleDriftState.set(payload.bucket, {
    bucket: payload.bucket,
    driftDays: toNumberOrNull(payload.driftDays),
    status: payload.status || null
  });
}

function recordRemoteTierStatus(payload) {
  if (!ensureMeter()) {
    return;
  }

  const labels = {
    bucket: payload.bucket || "unknown",
    storage_class: payload.storageClass || "unknown",
    status: payload.status || "unknown",
    service: resolveServiceName()
  };

  remoteTierCounter.add(1, labels);

  if (Number.isFinite(payload.writeDurationMs)) {
    remoteTierWriteHistogram.record(Number(payload.writeDurationMs), labels);
  }

  if (Number.isFinite(payload.fetchDurationMs)) {
    remoteTierFetchHistogram.record(Number(payload.fetchDurationMs), labels);
  }

  if (Number.isFinite(payload.bytes)) {
    remoteTierBytesHistogram.record(Number(payload.bytes), labels);
  }
}

async function flush() {
  if (!metricReader || typeof metricReader.forceFlush !== "function") {
    return;
  }

  try {
    await metricReader.forceFlush();
  } catch (error) {
    // Suppress flush errors to avoid failing lifecycle runs.
  }
}

async function shutdown() {
  if (meterProvider && typeof meterProvider.shutdown === "function") {
    try {
      await meterProvider.shutdown();
    } catch (error) {
      // Ignore shutdown failures.
    }
  }

  bucketUsageState.clear();
  lifecycleDriftState.clear();
  meterProvider = null;
  meter = null;
  metricReader = null;
  policyAppliedCounter = null;
  remoteTierCounter = null;
  remoteTierWriteHistogram = null;
  remoteTierFetchHistogram = null;
  remoteTierBytesHistogram = null;
}

function toNumberOrNull(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const numeric = Number(value);
  return Number.isNaN(numeric) ? null : numeric;
}

module.exports = {
  recordPolicyApplied,
  recordBucketUsage,
  recordLifecycleDrift,
  recordRemoteTierStatus,
  flush,
  shutdown
};
