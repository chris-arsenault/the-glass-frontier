"use strict";

const { EventEmitter } = require("events");
const { randomUUID } = require("crypto");
const { log } = require("../utils/logger");

const CHECK_REQUEST_TOPIC = "intent.checkRequest";
const CHECK_RESOLVED_TOPIC = "event.checkResolved";
const CHECK_VETOED_TOPIC = "event.checkVetoed";
const ADMIN_ALERT_TOPIC = "admin.alert";
const MODERATION_DECISION_TOPIC = "moderation.decision";

class CheckBus extends EventEmitter {
  constructor() {
    super();
  }

  emitCheckRequest(sessionId, payload) {
    const envelope = {
      id: payload.id || randomUUID(),
      sessionId,
      topic: CHECK_REQUEST_TOPIC,
      createdAt: new Date().toISOString(),
      auditRef: payload.auditRef || randomUUID(),
      ...payload
    };

    if (!envelope.data) {
      envelope.data = {
        trigger: payload.trigger || null,
        mechanics: payload.mechanics || null,
        metadata: payload.metadata || null
      };
    }

    this.emit(CHECK_REQUEST_TOPIC, envelope);
    log("info", "intent.checkRequest dispatched", { envelope });
    return envelope;
  }

  onCheckRequest(listener) {
    this.on(CHECK_REQUEST_TOPIC, listener);
  }

  emitCheckResolved(result) {
    const envelope = {
      ...result,
      topic: CHECK_RESOLVED_TOPIC,
      receivedAt: new Date().toISOString()
    };

    this.emit(CHECK_RESOLVED_TOPIC, envelope);
    log("info", "event.checkResolved received", { envelope });
    return envelope;
  }

  onCheckResolved(listener) {
    this.on(CHECK_RESOLVED_TOPIC, listener);
  }

  emitCheckVetoed(payload) {
    const envelope = {
      id: payload.id || randomUUID(),
      sessionId: payload.sessionId,
      topic: CHECK_VETOED_TOPIC,
      createdAt: new Date().toISOString(),
      auditRef: payload.auditRef || randomUUID(),
      reason: payload.reason,
      safetyFlags: payload.safetyFlags || [],
      data: payload.data || {}
    };

    this.emit(CHECK_VETOED_TOPIC, envelope);
    log("warn", "event.checkVetoed dispatched", { envelope });
    return envelope;
  }

  onCheckVetoed(listener) {
    this.on(CHECK_VETOED_TOPIC, listener);
  }

  emitAdminAlert(payload) {
    const envelope = {
      id: payload.id || randomUUID(),
      sessionId: payload.sessionId,
      topic: ADMIN_ALERT_TOPIC,
      createdAt: new Date().toISOString(),
      severity: payload.severity || "high",
      reason: payload.reason,
      data: payload.data || {}
    };

    this.emit(ADMIN_ALERT_TOPIC, envelope);
    log("warn", "admin.alert dispatched", { envelope });
    return envelope;
  }

  onAdminAlert(listener) {
    this.on(ADMIN_ALERT_TOPIC, listener);
  }

  emitModerationDecision(payload) {
    if (!payload || !payload.sessionId) {
      throw new Error("moderation_decision_requires_session");
    }

    const envelope = {
      id: payload.id || randomUUID(),
      sessionId: payload.sessionId,
      topic: MODERATION_DECISION_TOPIC,
      createdAt: new Date().toISOString(),
      action: payload.action || "acknowledge",
      alertId: payload.alertId || null,
      auditRef: payload.auditRef || randomUUID(),
      actor: payload.actor || null,
      notes: payload.notes || null,
      metadata: payload.metadata || {},
      status: payload.status || null
    };

    this.emit(MODERATION_DECISION_TOPIC, envelope);
    log("info", "moderation.decision dispatched", { envelope });
    return envelope;
  }

  onModerationDecision(listener) {
    this.on(MODERATION_DECISION_TOPIC, listener);
  }
}

module.exports = {
  CheckBus,
  CHECK_REQUEST_TOPIC,
  CHECK_RESOLVED_TOPIC,
  CHECK_VETOED_TOPIC,
  ADMIN_ALERT_TOPIC,
  MODERATION_DECISION_TOPIC
};
