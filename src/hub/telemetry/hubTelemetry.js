"use strict";

const { ContestMetrics } = require("../../telemetry/contestMetrics");

class HubTelemetry {
  constructor({ emitter, contestMetrics, clock = Date } = {}) {
    this.emitter = emitter || null;
    this.metrics =
      contestMetrics ||
      new ContestMetrics({
        clock
      });
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

  recordNarrativeDelivered({
    hubId,
    roomId,
    actorId,
    verbId,
    auditRef,
    contested,
    safetyEscalated
  }) {
    this.emit("telemetry.hub.narrativeDelivered", {
      hubId,
      roomId,
      actorId,
      verbId,
      auditRef,
      contested,
      safetyEscalated
    });
  }

  recordContestedAction({ hubId, roomId, actorId, verbId, auditRef, checkId }) {
    this.emit("telemetry.hub.contestedAction", {
      hubId,
      roomId,
      actorId,
      verbId,
      auditRef,
      checkId
    });
  }

  recordSafetyEscalated({ hubId, roomId, actorId, verbId, auditRef, severity, flags }) {
    this.emit("telemetry.hub.safetyEscalated", {
      hubId,
      roomId,
      actorId,
      verbId,
      auditRef,
      severity,
      flags
    });
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

  recordContestArmed({
    hubId,
    roomId,
    contestKey,
    participantCount,
    participantCapacity = null,
    createdAt = null,
    expiresAt = null,
    windowMs = null,
    label = null,
    move = null,
    type = null
  }) {
    const payload = {
      hubId,
      roomId,
      contestKey,
      participantCount,
      participantCapacity,
      createdAt,
      expiresAt,
      windowMs,
      label,
      move,
      type
    };
    this.emit("telemetry.hub.contestArmed", payload);
    if (this.metrics && typeof this.metrics.recordArmed === "function") {
      this.metrics.recordArmed(payload);
    }
  }

  recordContestLaunched({
    hubId,
    roomId,
    contestId,
    contestKey,
    participantCount,
    participantCapacity,
    createdAt,
    startedAt,
    label,
    move,
    type
  }) {
    const payload = {
      hubId,
      roomId,
      contestId,
      contestKey,
      participantCount,
      participantCapacity,
      createdAt,
      startedAt,
      label,
      move,
      type
    };
    this.emit("telemetry.hub.contestLaunched", payload);
    if (this.metrics && typeof this.metrics.recordLaunched === "function") {
      this.metrics.recordLaunched(payload);
    }
  }

  recordContestWorkflowStarted({ hubId, roomId, contestId, contestKey, workflowId, runId }) {
    const payload = {
      hubId,
      roomId,
      contestId,
      contestKey,
      workflowId,
      runId
    };
    this.emit("telemetry.hub.contestWorkflowStarted", payload);
    if (this.metrics && typeof this.metrics.recordWorkflowStarted === "function") {
      this.metrics.recordWorkflowStarted(payload);
    }
  }

  recordContestWorkflowFailed({ hubId, roomId, contestId, contestKey, error }) {
    const payload = {
      hubId,
      roomId,
      contestId,
      contestKey,
      error
    };
    this.emit("telemetry.hub.contestWorkflowFailed", payload);
    if (this.metrics && typeof this.metrics.recordWorkflowFailed === "function") {
      this.metrics.recordWorkflowFailed(payload);
    }
  }

  recordContestResolved({
    hubId,
    roomId,
    contestId,
    contestKey,
    outcome,
    resolvedAt,
    startedAt,
    createdAt,
    participantCount,
    participantCapacity,
    sharedComplicationCount
  }) {
    const payload = {
      hubId,
      roomId,
      contestId,
      contestKey,
      outcome,
      resolvedAt,
      startedAt,
      createdAt,
      participantCount,
      participantCapacity,
      sharedComplicationCount
    };
    this.emit("telemetry.hub.contestResolved", payload);
    if (this.metrics && typeof this.metrics.recordResolved === "function") {
      this.metrics.recordResolved(payload);
    }
  }
}

module.exports = {
  HubTelemetry
};
