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

  recordContestExpired({
    hubId,
    roomId,
    contestKey,
    expiredAt,
    createdAt,
    participantCount,
    participantCapacity,
    windowMs,
    label,
    move,
    type
  }) {
    const payload = {
      hubId,
      roomId,
      contestKey,
      expiredAt,
      createdAt,
      participantCount,
      participantCapacity,
      windowMs,
      label,
      move,
      type
    };
    this.emit("telemetry.hub.contestExpired", payload);
    if (this.metrics && typeof this.metrics.recordExpired === "function") {
      this.metrics.recordExpired(payload);
    }
  }

  recordContestRematchCooling({
    hubId,
    roomId,
    contestKey,
    cooldownMs,
    availableAt,
    expiredAt,
    participantCount,
    severity,
    missingParticipants
  }) {
    const payload = {
      hubId,
      roomId,
      contestKey,
      cooldownMs,
      availableAt,
      expiredAt,
      participantCount,
      severity,
      missingParticipants
    };
    this.emit("telemetry.hub.contestRematchCooling", payload);
    if (this.metrics && typeof this.metrics.recordRematchCooling === "function") {
      this.metrics.recordRematchCooling(payload);
    }
  }

  recordContestRematchBlocked({
    hubId,
    roomId,
    contestKey,
    actorId,
    remainingMs,
    cooldownMs
  }) {
    const payload = {
      hubId,
      roomId,
      contestKey,
      actorId,
      remainingMs,
      cooldownMs
    };
    this.emit("telemetry.hub.contestRematchBlocked", payload);
    if (this.metrics && typeof this.metrics.recordRematchBlocked === "function") {
      this.metrics.recordRematchBlocked(payload);
    }
  }

  recordContestSentiment({
    hubId,
    roomId,
    contestKey,
    actorId,
    sentiment,
    tone,
    phase,
    messageLength,
    remainingCooldownMs,
    cooldownMs,
    issuedAt
  }) {
    const payload = {
      hubId,
      roomId,
      contestKey,
      actorId,
      sentiment,
      tone,
      phase,
      messageLength,
      remainingCooldownMs,
      cooldownMs,
      issuedAt
    };
    this.emit("telemetry.hub.contestSentiment", payload);
    if (this.metrics && typeof this.metrics.recordSentimentSample === "function") {
      this.metrics.recordSentimentSample(payload);
    }
  }

  recordContestTimingFallback({ hubId, roomId, contestId, timings }) {
    const payload = {
      hubId,
      roomId,
      contestId,
      timings: timings || null
    };
    this.emit("telemetry.hub.contestTimingFallback", payload);
    if (this.metrics && typeof this.metrics.recordTimingFallback === "function") {
      this.metrics.recordTimingFallback(payload);
    }
  }
}

module.exports = {
  HubTelemetry
};
