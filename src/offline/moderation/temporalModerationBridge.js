"use strict";

const { log } = require("../../utils/logger");

class TemporalModerationBridge {
  constructor({
    sessionMemory,
    queueStore = null,
    temporalClient,
    clock = () => new Date(),
    logger = log
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

    this.unsubscribe = null;
    this.started = false;
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
    if (typeof this.unsubscribe === "function") {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  async #sync(sessionId, queueState) {
    if (!sessionId || !queueState) {
      return;
    }

    await this.temporalClient.syncCadenceSnapshot({
      sessionId,
      queue: queueState,
      timestamp: this.clock().toISOString()
    });
  }
}

module.exports = {
  TemporalModerationBridge
};
