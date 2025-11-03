"use strict";

class HubTelemetry {
  constructor({ emitter } = {}) {
    this.emitter = emitter || null;
  }

  emit(topic, payload) {
    if (this.emitter && typeof this.emitter.emit === "function") {
      this.emitter.emit(topic, payload);
    }
  }

  recordConnectionOpened({ hubId, roomId, actorId }) {
    this.emit("telemetry.hub.connectionOpened", { hubId, roomId, actorId });
  }

  recordConnectionClosed({ hubId, roomId, actorId }) {
    this.emit("telemetry.hub.connectionClosed", { hubId, roomId, actorId });
  }

  recordCommandAccepted({ hubId, roomId, actorId, verbId }) {
    this.emit("telemetry.hub.commandAccepted", { hubId, roomId, actorId, verbId });
  }

  recordCommandRejected({ hubId, roomId, actorId, verbId, reason }) {
    this.emit("telemetry.hub.commandRejected", {
      hubId,
      roomId,
      actorId,
      verbId,
      reason
    });
  }

  recordNarrativeEscalation({ hubId, roomId, actorId, verbId }) {
    this.emit("telemetry.hub.narrativeEscalation", { hubId, roomId, actorId, verbId });
  }
}

module.exports = {
  HubTelemetry
};
