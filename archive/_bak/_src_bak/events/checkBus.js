"use strict";

import { EventEmitter  } from "events";
import { randomUUID  } from "crypto";
import { log  } from "../utils/logger.js";
import { CheckRequest, CheckResult, AdminAlert, ModerationDecision  } from "../../_lib_bak/envelopes/index.js";

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
    const checkRequest = new CheckRequest({
      type: "check.prompt",
      id: payload.id || randomUUID(),
      auditRef: payload.auditRef || randomUUID(),
      data: payload.data || {
        move: payload.move,
        ability: payload.ability,
        difficulty: payload.difficulty,
        difficultyValue: payload.difficultyValue,
        rationale: payload.rationale,
        flags: payload.flags || [],
        safetyFlags: payload.safetyFlags || [],
        momentum: payload.momentum
      }
    });

    const envelope = {
      ...checkRequest.serialize(),
      sessionId,
      topic: CHECK_REQUEST_TOPIC,
      createdAt: new Date().toISOString()
    };

    this.emit(CHECK_REQUEST_TOPIC, envelope);
    log("info", "intent.checkRequest dispatched", { checkId: envelope.id });
    return envelope;
  }

  onCheckRequest(listener) {
    this.on(CHECK_REQUEST_TOPIC, listener);
  }

  emitCheckResolved(result) {
    const checkResult = new CheckResult(result);

    const envelope = {
      ...checkResult.serialize(),
      topic: CHECK_RESOLVED_TOPIC,
      receivedAt: new Date().toISOString()
    };

    this.emit(CHECK_RESOLVED_TOPIC, envelope);
    log("info", "event.checkResolved received", { checkId: envelope.id, result: envelope.result });
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
    const adminAlert = new AdminAlert({
      id: payload.id || randomUUID(),
      sessionId: payload.sessionId,
      severity: payload.severity || "high",
      reason: payload.reason,
      message: payload.message,
      data: payload.data || {}
    });

    const envelope = {
      ...adminAlert.serialize(),
      topic: ADMIN_ALERT_TOPIC
    };

    this.emit(ADMIN_ALERT_TOPIC, envelope);
    log("warn", "admin.alert dispatched", { alertId: envelope.id, reason: envelope.reason });
    return envelope;
  }

  onAdminAlert(listener) {
    this.on(ADMIN_ALERT_TOPIC, listener);
  }

  emitModerationDecision(payload) {
    if (!payload || !payload.sessionId) {
      throw new Error("moderation_decision_requires_session");
    }

    const moderationDecision = new ModerationDecision({
      id: payload.id || randomUUID(),
      sessionId: payload.sessionId,
      action: payload.action || "acknowledge",
      alertId: payload.alertId || null,
      actor: payload.actor || null,
      notes: payload.notes || null,
      metadata: payload.metadata || {},
      status: payload.status || null
    });

    const envelope = {
      ...moderationDecision.serialize(),
      topic: MODERATION_DECISION_TOPIC,
      auditRef: payload.auditRef || randomUUID()
    };

    this.emit(MODERATION_DECISION_TOPIC, envelope);
    log("info", "moderation.decision dispatched", { decisionId: envelope.id, action: envelope.action });
    return envelope;
  }

  onModerationDecision(listener) {
    this.on(MODERATION_DECISION_TOPIC, listener);
  }
}

export {
  CheckBus,
  CHECK_REQUEST_TOPIC,
  CHECK_RESOLVED_TOPIC,
  CHECK_VETOED_TOPIC,
  ADMIN_ALERT_TOPIC,
  MODERATION_DECISION_TOPIC
};
