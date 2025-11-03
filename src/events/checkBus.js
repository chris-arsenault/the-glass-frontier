"use strict";

const { EventEmitter } = require("events");
const { v4: uuid } = require("uuid");
const { log } = require("../utils/logger");

const CHECK_REQUEST_TOPIC = "intent.checkRequest";
const CHECK_RESOLVED_TOPIC = "event.checkResolved";

class CheckBus extends EventEmitter {
  constructor() {
    super();
  }

  emitCheckRequest(sessionId, payload) {
    const envelope = {
      id: payload.id || uuid(),
      sessionId,
      topic: CHECK_REQUEST_TOPIC,
      createdAt: new Date().toISOString(),
      auditRef: payload.auditRef || uuid(),
      data: payload.data || {}
    };

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
}

module.exports = {
  CheckBus,
  CHECK_REQUEST_TOPIC,
  CHECK_RESOLVED_TOPIC
};
