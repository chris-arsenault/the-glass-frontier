"use strict";

const DEFAULT_NAMESPACE = "glass-frontier-dev";
const DEFAULT_TASK_QUEUE = "tgf-offline-dev";
const DEFAULT_METRICS_NAMESPACE = "offline.dev";

function normalize(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = normalize(value);
  if (!normalized) {
    return false;
  }
  switch (normalized.toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "y":
      return true;
    default:
      return false;
  }
}

function resolveTemporalWorkerConfig(env = process.env) {
  return {
    namespace: normalize(env.TEMPORAL_NAMESPACE || env.TEMPORAL_DOMAIN),
    taskQueue: normalize(env.TEMPORAL_TASK_QUEUE || env.TEMPORAL_QUEUE),
    metricsNamespace: normalize(env.METRICS_NAMESPACE || env.TEMPORAL_METRICS_NAMESPACE),
    otelEndpoint: normalize(env.OTEL_EXPORTER_OTLP || env.OTEL_EXPORTER_OTLP_ENDPOINT)
  };
}

function shouldEnforceStrictTemporalConfig(env = process.env) {
  if (toBoolean(env.TEMPORAL_STRICT_CONFIG)) {
    return true;
  }
  if (toBoolean(env.TEMPORAL_ALLOW_FALLBACK)) {
    return false;
  }
  const nodeEnv = normalize(env.NODE_ENV);
  if (nodeEnv && nodeEnv.toLowerCase() === "production") {
    return true;
  }
  if (toBoolean(env.CI)) {
    return true;
  }
  return false;
}

function validateTemporalWorkerConfig(config, options = {}) {
  const missing = [];
  const requireNamespace = options.requireNamespace !== false;
  const requireTaskQueue = options.requireTaskQueue !== false;
  const requireOtelEndpoint = options.requireOtelEndpoint === true;

  if (requireNamespace && !config.namespace) {
    missing.push("TEMPORAL_NAMESPACE");
  }
  if (requireTaskQueue && !config.taskQueue) {
    missing.push("TEMPORAL_TASK_QUEUE");
  }
  if (requireOtelEndpoint && !config.otelEndpoint) {
    missing.push("OTEL_EXPORTER_OTLP");
  }

  if (missing.length > 0) {
    const error = new Error(
      `temporal_worker_missing_config: ${missing.join(", ")}`
    );
    error.code = "temporal_worker_missing_config";
    error.missing = missing;
    throw error;
  }

  return config;
}

function applyTemporalWorkerDefaults(config, defaults = {}) {
  const mapping = {
    namespace: defaults.namespace || DEFAULT_NAMESPACE,
    taskQueue: defaults.taskQueue || DEFAULT_TASK_QUEUE,
    metricsNamespace: defaults.metricsNamespace || DEFAULT_METRICS_NAMESPACE
  };

  return {
    namespace: config.namespace || mapping.namespace,
    taskQueue: config.taskQueue || mapping.taskQueue,
    metricsNamespace: config.metricsNamespace || mapping.metricsNamespace,
    otelEndpoint: config.otelEndpoint || null
  };
}

function resolveAndValidateTemporalWorkerConfig(env = process.env, options = {}) {
  const config = resolveTemporalWorkerConfig(env);
  const strict =
    typeof options.strict === "boolean" ? options.strict : shouldEnforceStrictTemporalConfig(env);

  if (strict) {
    return validateTemporalWorkerConfig(config, options);
  }

  return applyTemporalWorkerDefaults(config, options.defaults);
}

module.exports = {
  DEFAULT_METRICS_NAMESPACE,
  DEFAULT_NAMESPACE,
  DEFAULT_TASK_QUEUE,
  applyTemporalWorkerDefaults,
  resolveAndValidateTemporalWorkerConfig,
  resolveTemporalWorkerConfig,
  shouldEnforceStrictTemporalConfig,
  validateTemporalWorkerConfig
};

