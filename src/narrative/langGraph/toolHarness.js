"use strict";

const { v4: uuid } = require("uuid");

const DEFAULT_MAX_RETRIES = 2;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class ToolHarness {
  constructor({ sessionMemory, checkBus, telemetry, maxRetries = DEFAULT_MAX_RETRIES }) {
    if (!sessionMemory) {
      throw new Error("ToolHarness requires a sessionMemory facade");
    }
    if (!checkBus) {
      throw new Error("ToolHarness requires a checkBus instance");
    }

    this.sessionMemory = sessionMemory;
    this.checkBus = checkBus;
    this.telemetry = telemetry;
    this.maxRetries = Math.max(0, maxRetries);
  }

  loadSession(sessionId) {
    return this.sessionMemory.getSessionState(sessionId);
  }

  generateAuditRef({ sessionId, component, turnSequence }) {
    return `${component}:${sessionId}:${turnSequence}:${uuid()}`;
  }

  async appendPlayerMessage(sessionId, entry) {
    return this.#withRetries(
      async () => this.sessionMemory.appendTranscript(sessionId, { role: "player", ...entry }),
      { operation: "appendPlayerMessage", sessionId }
    );
  }

  async appendGmMessage(sessionId, entry) {
    return this.#withRetries(
      async () => this.sessionMemory.appendTranscript(sessionId, { role: "gm", ...entry }),
      { operation: "appendGmMessage", sessionId }
    );
  }

  async dispatchCheckRequest(sessionId, request) {
    return this.#withRetries(
      async () => {
        this.sessionMemory.recordCheckRequest(sessionId, request);
        const envelope = this.checkBus.emitCheckRequest(sessionId, request);
        this.telemetry?.recordCheckDispatch({
          sessionId,
          auditRef: request.auditRef || envelope.auditRef,
          checkId: envelope.id
        });
        return envelope;
      },
      { operation: "dispatchCheckRequest", sessionId, referenceId: request?.id }
    );
  }

  async escalateModeration(sessionId, alert) {
    return this.#withRetries(
      async () => {
        const envelope = this.checkBus.emitAdminAlert({
          sessionId,
          ...alert
        });
        this.telemetry?.recordSafetyEvent({
          sessionId,
          auditRef: alert.auditRef,
          severity: alert.severity,
          flags: alert.flags || [],
          reason: alert.reason
        });
        return envelope;
      },
      { operation: "escalateModeration", sessionId, referenceId: alert?.auditRef }
    );
  }

  async recordCheckVeto(sessionId, payload) {
    return this.#withRetries(
      async () => {
        const envelope = this.checkBus.emitCheckVetoed({
          sessionId,
          ...payload
        });
        this.telemetry?.recordSafetyEvent({
          sessionId,
          auditRef: payload.auditRef,
          severity: payload.severity || "high",
          flags: payload.safetyFlags || [],
          reason: payload.reason || "check vetoed"
        });
        return envelope;
      },
      { operation: "recordCheckVeto", sessionId, referenceId: payload?.auditRef }
    );
  }

  async #withRetries(execute, details) {
    let attempt = 0;
    let lastError;

    while (attempt <= this.maxRetries) {
      try {
        // eslint-disable-next-line no-await-in-loop
        return await execute(attempt);
      } catch (error) {
        lastError = error;
        this.telemetry?.recordToolError({
          sessionId: details.sessionId,
          operation: details.operation,
          referenceId: details.referenceId,
          attempt,
          message: error.message
        });

        if (attempt === this.maxRetries) {
          throw error;
        }

        // eslint-disable-next-line no-await-in-loop
        await delay(10 * (attempt + 1));
        attempt += 1;
      }
    }

    throw lastError;
  }
}

function createToolHarness(config) {
  return new ToolHarness(config);
}

module.exports = {
  ToolHarness,
  createToolHarness
};
