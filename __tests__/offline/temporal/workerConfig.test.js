"use strict";

const {
  applyTemporalWorkerDefaults,
  resolveTemporalWorkerConfig,
  resolveAndValidateTemporalWorkerConfig,
  shouldEnforceStrictTemporalConfig,
  validateTemporalWorkerConfig,
  DEFAULT_NAMESPACE,
  DEFAULT_TASK_QUEUE,
  DEFAULT_METRICS_NAMESPACE
} = require("../../../src/offline/temporal/workerConfig");

function cloneEnv(overrides = {}) {
  return {
    NODE_ENV: "test",
    ...overrides
  };
}

describe("offline/temporal/workerConfig", () => {
  it("resolves explicit environment variables", () => {
    const env = cloneEnv({
      TEMPORAL_NAMESPACE: "glass-frontier-stage",
      TEMPORAL_TASK_QUEUE: "offline-queue",
      METRICS_NAMESPACE: "offline.metrics",
      OTEL_EXPORTER_OTLP: "http://otel:4317"
    });

    const config = resolveTemporalWorkerConfig(env);
    expect(config).toEqual({
      namespace: "glass-frontier-stage",
      taskQueue: "offline-queue",
      metricsNamespace: "offline.metrics",
      otelEndpoint: "http://otel:4317"
    });
  });

  it("applies defaults when running in non-strict mode", () => {
    const env = cloneEnv();
    const config = resolveAndValidateTemporalWorkerConfig(env, { strict: false });

    expect(config).toEqual({
      namespace: DEFAULT_NAMESPACE,
      taskQueue: DEFAULT_TASK_QUEUE,
      metricsNamespace: DEFAULT_METRICS_NAMESPACE,
      otelEndpoint: null
    });
  });

  it("enforces required config in strict mode", () => {
    const env = cloneEnv({ NODE_ENV: "production" });
    expect(() => resolveAndValidateTemporalWorkerConfig(env)).toThrow(
      /temporal_worker_missing_config/
    );
  });

  it("skips strict enforcement when TEMPORAL_ALLOW_FALLBACK is true", () => {
    const env = cloneEnv({ NODE_ENV: "production", TEMPORAL_ALLOW_FALLBACK: "true" });
    const config = resolveAndValidateTemporalWorkerConfig(env);
    expect(config.namespace).toBe(DEFAULT_NAMESPACE);
    expect(config.taskQueue).toBe(DEFAULT_TASK_QUEUE);
  });

  it("treats CI=true as strict even when NODE_ENV is not production", () => {
    const env = cloneEnv({ CI: "true" });
    expect(shouldEnforceStrictTemporalConfig(env)).toBe(true);
  });

  it("validateTemporalWorkerConfig reports missing keys", () => {
    const config = {
      namespace: null,
      taskQueue: null,
      metricsNamespace: null,
      otelEndpoint: null
    };

    try {
      validateTemporalWorkerConfig(config);
    } catch (error) {
      expect(error.code).toBe("temporal_worker_missing_config");
      expect(error.missing).toEqual(["TEMPORAL_NAMESPACE", "TEMPORAL_TASK_QUEUE"]);
    }
  });

  it("applyTemporalWorkerDefaults accepts custom fallback values", () => {
    const config = {
      namespace: null,
      taskQueue: null,
      metricsNamespace: null,
      otelEndpoint: "http://otel:4317"
    };

    const withDefaults = applyTemporalWorkerDefaults(config, {
      namespace: "custom-namespace",
      taskQueue: "custom-queue",
      metricsNamespace: "custom.metrics"
    });

    expect(withDefaults).toEqual({
      namespace: "custom-namespace",
      taskQueue: "custom-queue",
      metricsNamespace: "custom.metrics",
      otelEndpoint: "http://otel:4317"
    });
  });
});
