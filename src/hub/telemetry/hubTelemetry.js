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

  recordCatalogUpdated({ hubId, versionStamp, verbCount }) {
    this.emit("telemetry.hub.catalogUpdated", { hubId, versionStamp, verbCount });
  }

  recordCatalogBroadcastFailed({ hubId, connectionId, error }) {
    this.emit("telemetry.hub.catalogBroadcastFailed", { hubId, connectionId, error });
  }

  recordStateUpdated({ hubId, roomId, version, verbId, actorId }) {
    this.emit("telemetry.hub.stateUpdated", {
      hubId,
      roomId,
      version,
      verbId,
      actorId
    });
  }

  recordStateBroadcastFailed({ hubId, roomId, connectionId, error }) {
    this.emit("telemetry.hub.stateBroadcastFailed", {
      hubId,
      roomId,
      connectionId,
      error
    });
  }

  recordWorkflowStarted({ hubId, roomId, actorId, verbId, workflowId, runId }) {
    this.emit("telemetry.hub.workflowStarted", {
      hubId,
      roomId,
      actorId,
      verbId,
      workflowId,
      runId
    });
  }

  recordWorkflowFailed({ hubId, roomId, actorId, verbId, error }) {
    this.emit("telemetry.hub.workflowFailed", {
      hubId,
      roomId,
      actorId,
      verbId,
      error
    });
  }

  recordStateSnapshotSent({ hubId, roomId, connectionId, version }) {
    this.emit("telemetry.hub.stateSnapshotSent", {
      hubId,
      roomId,
      connectionId,
      version
    });
  }
}

module.exports = {
  HubTelemetry
};
