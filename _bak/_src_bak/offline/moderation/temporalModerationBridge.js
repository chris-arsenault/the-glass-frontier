"use strict";

import { log  } from "../../utils/logger.js";
import { ModerationMetrics  } from "../../telemetry/moderationMetrics.js";

const DEFAULT_RETRY_OPTIONS = {
  maxAttempts: 5,
  baseDelayMs: 2000,
  maxDelayMs: 60000,
  jitterRatio: 0.2
};

class TemporalModerationBridge {
  constructor({
    sessionMemory,
    queueStore = null,
    temporalClient,
    clock = () => new Date(),
    logger = log,
    metrics = null,
    retryOptions = {},
    random = Math.random
  } = {}) {
    if (!sessionMemory) {
      throw new Error("temporal_moderation_bridge_requires_session_memory");
    }
    if (!temporalClient || typeof temporalClient.syncCadenceSnapshot !== "function") {
      throw new Error("temporal_moderation_bridge_requires_temporal_client");
    }

    this.sessionMemory = sessionMemory;
    this.queueStore = queueStore;
    this.temporalClient = temporalClient;
    this.clock = clock;
    this.log = logger;
    this.metrics = this.#resolveMetrics(metrics);
    this.random = typeof random === "function" ? random : Math.random;
    this.retryConfig = this.#buildRetryConfig(retryOptions);

    this.unsubscribe = null;
    this.started = false;
    this.retryState = new Map();
  }

  async start() {
    if (this.started) {
      return;
    }
    this.started = true;

    if (this.queueStore && typeof this.queueStore.listQueues === "function") {
      try {
        const records = await this.queueStore.listQueues();
        for (const record of records) {
          await this.#sync(record.sessionId, record.state || {});
        }
      } catch (error) {
        this.log("warn", "temporal_moderation_bridge_hydration_failed", {
          message: error.message
        });
      }
    }

    this.unsubscribe = this.sessionMemory.onModerationQueueUpdated((sessionId, queueState) => {
      this.#sync(sessionId, queueState).catch((error) => {
        this.log("error", "temporal_moderation_bridge_sync_failed", {
          sessionId,
          message: error.message
        });
      });
    });
  }

  async stop() {
    if (!this.started) {
      return;
    }
    this.started = false;
    this.#clearAllRetries();
    if (typeof this.unsubscribe === "function") {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  async #sync(sessionId, queueState) {
    if (!sessionId || !queueState) {
      return;
    }

    this.#clearRetry(sessionId);
    await this.#performSync(sessionId, queueState, 1);
  }

  async #performSync(sessionId, queueState, attempt) {
    if (!sessionId || !queueState) {
      return;
    }

    const startTime = Date.now();
    this.metrics.recordTemporalSyncAttempt({ sessionId, attempt });

    try {
      await this.temporalClient.syncCadenceSnapshot({
        sessionId,
        queue: queueState,
        timestamp: this.clock().toISOString()
      });
      const durationMs = Date.now() - startTime;
      this.metrics.recordTemporalSyncSuccess({ sessionId, attempt, durationMs });
      this.retryState.delete(sessionId);
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const willRetry = this.#handleFailure({
        sessionId,
        queueState,
        attempt,
        error,
        durationMs
      });
      if (!willRetry) {
        this.retryState.delete(sessionId);
      }
      throw error;
    }
  }

  #handleFailure({ sessionId, queueState, attempt, error, durationMs }) {
    const retryable = this.#shouldRetry(error) && attempt < this.retryConfig.maxAttempts;

    this.metrics.recordTemporalSyncFailure({
      sessionId,
      attempt,
      durationMs,
      message: error?.message,
      code: error?.code,
      status: error?.status,
      willRetry: retryable
    });

    if (!retryable) {
      this.metrics.recordTemporalSyncGiveUp({
        sessionId,
        attempts: attempt,
        message: error?.message,
        code: error?.code,
        status: error?.status
      });
      this.log("error", "temporal_moderation_bridge_retry_exhausted", {
        sessionId,
        attempt,
        message: error?.message,
        status: error?.status,
        code: error?.code
      });
      return false;
    }

    this.#scheduleRetry(sessionId, queueState, attempt + 1, error);
    return true;
  }

  #scheduleRetry(sessionId, queueState, nextAttempt, error) {
    const backoffMs = this.#computeBackoffDelay(nextAttempt);
    const retryAt = new Date(this.clock().getTime() + backoffMs).toISOString();
    const reason = this.#resolveFailureReason(error);

    const existing = this.retryState.get(sessionId);
    if (existing && existing.timeout) {
      clearTimeout(existing.timeout);
    }

    const timeout = setTimeout(() => {
      this.retryState.delete(sessionId);
      this.#performSync(sessionId, queueState, nextAttempt).catch(() => {});
    }, backoffMs);

    this.retryState.set(sessionId, {
      attempt: nextAttempt,
      queueState,
      timeout
    });

    this.metrics.recordTemporalSyncRetryScheduled({
      sessionId,
      attempt: nextAttempt,
      retryAt,
      backoffMs,
      reason
    });
  }

  #clearRetry(sessionId) {
    const entry = this.retryState.get(sessionId);
    if (entry && entry.timeout) {
      clearTimeout(entry.timeout);
    }
    if (entry) {
      this.retryState.delete(sessionId);
    }
  }

  #clearAllRetries() {
    for (const entry of this.retryState.values()) {
      if (entry.timeout) {
        clearTimeout(entry.timeout);
      }
    }
    this.retryState.clear();
  }

  #computeBackoffDelay(attempt) {
    const normalizedAttempt = Math.max(2, attempt);
    const exponent = normalizedAttempt - 2;
    const baseDelay = this.retryConfig.baseDelayMs * Math.pow(2, exponent);
    const cappedDelay = Math.min(baseDelay, this.retryConfig.maxDelayMs);
    if (this.retryConfig.jitterRatio <= 0) {
      return Math.max(0, Math.round(cappedDelay));
    }
    const jitter = Math.round(cappedDelay * this.retryConfig.jitterRatio * this.random());
    const total = Math.min(this.retryConfig.maxDelayMs, cappedDelay + jitter);
    return Math.max(0, Math.round(total));
  }

  #shouldRetry(error) {
    if (!error) {
      return true;
    }

    if (error.code === "temporal_moderation_sync_timeout") {
      return true;
    }

    if (typeof error.status === "number") {
      if (error.status >= 500) {
        return true;
      }
      if (error.status === 429) {
        return true;
      }
      return false;
    }

    return true;
  }

  #resolveFailureReason(error) {
    if (!error) {
      return "unknown";
    }
    if (error.code) {
      return error.code;
    }
    if (typeof error.status === "number") {
      return `http_${error.status}`;
    }
    if (error.message) {
      return error.message;
    }
    return "unknown";
  }

  #resolveMetrics(metrics) {
    if (
      metrics &&
      typeof metrics.recordTemporalSyncAttempt === "function" &&
      typeof metrics.recordTemporalSyncSuccess === "function" &&
      typeof metrics.recordTemporalSyncFailure === "function" &&
      typeof metrics.recordTemporalSyncRetryScheduled === "function" &&
      typeof metrics.recordTemporalSyncGiveUp === "function"
    ) {
      return metrics;
    }
    return new ModerationMetrics();
  }

  #buildRetryConfig(options = {}) {
    const merged = {
      ...DEFAULT_RETRY_OPTIONS,
      ...(options || {})
    };

    const maxAttempts = Number.isFinite(merged.maxAttempts) && merged.maxAttempts > 0
      ? Math.floor(merged.maxAttempts)
      : DEFAULT_RETRY_OPTIONS.maxAttempts;
    const baseDelayMs =
      Number.isFinite(merged.baseDelayMs) && merged.baseDelayMs > 0
        ? merged.baseDelayMs
        : DEFAULT_RETRY_OPTIONS.baseDelayMs;
    const maxDelayMs =
      Number.isFinite(merged.maxDelayMs) && merged.maxDelayMs >= baseDelayMs
        ? merged.maxDelayMs
        : Math.max(DEFAULT_RETRY_OPTIONS.maxDelayMs, baseDelayMs);
    const jitterRatio =
      typeof merged.jitterRatio === "number" && merged.jitterRatio >= 0
        ? Math.min(merged.jitterRatio, 1)
        : DEFAULT_RETRY_OPTIONS.jitterRatio;

    return {
      maxAttempts,
      baseDelayMs,
      maxDelayMs,
      jitterRatio
    };
  }
}

export {
  TemporalModerationBridge
};
