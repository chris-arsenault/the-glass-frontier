"use strict";

const { log } = require("../../utils/logger");

class SessionTelemetry {
  constructor({ emitter = log } = {}) {
    this.emitter = emitter;
  }

  recordTransition({ sessionId, nodeId, status, turnSequence, metadata = {} }) {
    this.emitter("info", "telemetry.session.transition", {
      sessionId,
      nodeId,
      status,
      turnSequence,
      ...metadata
    });
  }

  recordCheckDispatch({ sessionId, auditRef, checkId }) {
    this.emitter("info", "telemetry.session.check-dispatch", {
      sessionId,
      auditRef,
      checkId
    });
  }

  recordSafetyEvent({ sessionId, auditRef, severity, flags = [], reason }) {
    this.emitter("warn", "telemetry.session.safety", {
      sessionId,
      auditRef,
      severity,
      flags,
      reason
    });
  }

  recordToolError({ sessionId, operation, referenceId, attempt, message }) {
    this.emitter("error", "telemetry.session.tool-error", {
      sessionId,
      operation,
      referenceId,
      attempt,
      message
    });
  }

  recordCheckResolution({ sessionId, auditRef, checkId, result }) {
    this.emitter("info", "telemetry.session.check-resolution", {
      sessionId,
      auditRef,
      checkId,
      result
    });
  }
}

module.exports = {
  SessionTelemetry
};
