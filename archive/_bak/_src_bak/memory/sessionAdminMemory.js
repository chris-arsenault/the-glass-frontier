"use strict";

import { log  } from "../utils/logger.js";
import { clone, toIsoTimestamp  } from "./sessionMemoryUtils.js";

function createInitialModerationState() {
  return {
    alerts: [],
    decisions: [],
    queue: {
      generatedAt: null,
      updatedAt: null,
      pendingCount: 0,
      items: [],
      window: null,
      cadence: null
    }
  };
}

function ensureModerationState(session) {
  if (!session.moderation) {
    session.moderation = createInitialModerationState();
    return session.moderation;
  }

  if (!Array.isArray(session.moderation.alerts)) {
    session.moderation.alerts = [];
  }
  if (!Array.isArray(session.moderation.decisions)) {
    session.moderation.decisions = [];
  }
  if (!session.moderation.queue) {
    session.moderation.queue = createInitialModerationState().queue;
  }

  return session.moderation;
}

const adminMemoryMixin = {
  async hydrateModerationQueuesFromStore() {
    if (!this.moderationQueueStore) {
      return;
    }

    this.hydratingModerationQueues = true;
    try {
      const records = await this.moderationQueueStore.listQueues();
      for (const record of records) {
        try {
          this.recordModerationQueue(record.sessionId, record.state || {});
        } catch (error) {
          log("warn", "Failed to hydrate moderation queue entry", {
            sessionId: record.sessionId,
            message: error.message
          });
        }
      }
    } catch (error) {
      log("error", "Failed to hydrate moderation queues from store", {
        message: error.message
      });
    } finally {
      this.hydratingModerationQueues = false;
    }
  },

  recordModerationAlert(sessionId, alert) {
    const session = this.ensureSession(sessionId);
    const moderationState = ensureModerationState(session);

    const record = clone(alert);
    const index = moderationState.alerts.findIndex((existing) => existing.id === record.id);
    if (index >= 0) {
      moderationState.alerts[index] = record;
    } else {
      moderationState.alerts.push(record);
    }

    session.updatedAt = record.updatedAt || record.createdAt || new Date().toISOString();
    return clone(record);
  },

  updateModerationAlert(sessionId, alertId, updates = {}) {
    const session = this.ensureSession(sessionId);
    const moderationState = ensureModerationState(session);

    if (!moderationState) {
      return null;
    }

    const index = moderationState.alerts.findIndex((entry) => entry.id === alertId);
    if (index === -1) {
      return null;
    }

    const existing = moderationState.alerts[index];
    const merged = {
      ...existing,
      ...clone(updates)
    };

    if (updates.decisions) {
      merged.decisions = Array.isArray(updates.decisions)
        ? updates.decisions.map((entry) => clone(entry))
        : [];
    }

    if (updates.history) {
      merged.history = Array.isArray(updates.history)
        ? updates.history.map((entry) => clone(entry))
        : [];
    }

    moderationState.alerts[index] = merged;
    session.updatedAt = merged.updatedAt || new Date().toISOString();
    return clone(merged);
  },

  recordModerationDecision(sessionId, decision) {
    const session = this.ensureSession(sessionId);
    const moderationState = ensureModerationState(session);

    const record = clone(decision);
    moderationState.decisions.push(record);
    session.updatedAt = record.createdAt || new Date().toISOString();
    return clone(record);
  },

  recordModerationQueue(sessionId, queueState = {}) {
    const session = this.ensureSession(sessionId);
    const moderationState = ensureModerationState(session);
    const previousQueue = moderationState.queue || createInitialModerationState().queue;

    const generatedAt = queueState.generatedAt || new Date().toISOString();
    const rawItems = Array.isArray(queueState.items) ? queueState.items : [];
    const previousIndex = new Map(
      Array.isArray(previousQueue.items)
        ? previousQueue.items.map((item) => [item.deltaId, item])
        : []
    );

    const mergedItems = rawItems.map((item) => {
      const clonedItem = clone(item);
      const existing = previousIndex.get(clonedItem.deltaId);
      if (existing) {
        clonedItem.status = existing.status || clonedItem.status;
        clonedItem.blocking =
          existing.blocking !== undefined ? existing.blocking : clonedItem.blocking;
        clonedItem.moderationDecisionId =
          existing.moderationDecisionId !== undefined
            ? existing.moderationDecisionId
            : clonedItem.moderationDecisionId || null;
        clonedItem.resolvedAt = existing.resolvedAt || clonedItem.resolvedAt || null;
        clonedItem.decisionActor = existing.decisionActor || clonedItem.decisionActor || null;
        clonedItem.notes = existing.notes || clonedItem.notes || null;
        clonedItem.updatedAt = existing.updatedAt || clonedItem.updatedAt || generatedAt;
      } else {
        clonedItem.updatedAt = clonedItem.updatedAt || generatedAt;
      }
      if (clonedItem.blocking === undefined) {
        clonedItem.blocking = clonedItem.status !== "resolved";
      }
      return clonedItem;
    });

    const pendingCount = mergedItems.filter((item) => item.blocking !== false).length;

    moderationState.queue = {
      generatedAt,
      updatedAt: generatedAt,
      pendingCount,
      items: mergedItems,
      window: queueState.window ? clone(queueState.window) : null,
      cadence: queueState.cadence ? clone(queueState.cadence) : null
    };

    session.updatedAt = generatedAt;
    this.scheduleModerationPersist(sessionId, moderationState.queue);
    this.emitModerationQueueUpdated(sessionId, moderationState.queue);
    return clone(moderationState.queue);
  },

  updateModerationQueueEntry(sessionId, deltaId, updates = {}) {
    const session = this.ensureSession(sessionId);
    const moderationState = ensureModerationState(session);
    const queue = moderationState.queue;
    if (!queue || !Array.isArray(queue.items)) {
      return null;
    }

    const index = queue.items.findIndex((item) => item.deltaId === deltaId);
    if (index === -1) {
      return null;
    }

    const existing = queue.items[index];
    const updatedAt = updates.updatedAt || new Date().toISOString();

    const next = {
      ...existing,
      status: updates.status || existing.status,
      blocking:
        updates.blocking !== undefined ? updates.blocking : existing.blocking !== false,
      moderationDecisionId:
        updates.moderationDecisionId !== undefined
          ? updates.moderationDecisionId
          : existing.moderationDecisionId || null,
      resolvedAt:
        updates.resolvedAt !== undefined ? updates.resolvedAt : existing.resolvedAt || null,
      decisionActor:
        updates.decisionActor !== undefined ? updates.decisionActor : existing.decisionActor || null,
      notes: updates.notes !== undefined ? updates.notes : existing.notes || null,
      updatedAt
    };

    queue.items[index] = next;
    queue.pendingCount = queue.items.filter((item) => item.blocking !== false).length;
    queue.updatedAt = updatedAt;
    session.updatedAt = updatedAt;

    this.scheduleModerationPersist(sessionId, queue);
    this.emitModerationQueueUpdated(sessionId, queue);
    return clone(next);
  },

  updateModerationCadence(sessionId, cadenceState = null) {
    const session = this.ensureSession(sessionId);
    const moderationState = ensureModerationState(session);
    const nowIso = new Date().toISOString();

    if (!moderationState.queue) {
      moderationState.queue = {
        generatedAt: nowIso,
        updatedAt: nowIso,
        pendingCount: 0,
        items: [],
        window: null,
        cadence: cadenceState ? clone(cadenceState) : null
      };
      session.updatedAt = nowIso;
      return clone(moderationState.queue);
    }

    moderationState.queue.cadence = cadenceState ? clone(cadenceState) : null;
    moderationState.queue.updatedAt = nowIso;
    session.updatedAt = nowIso;
    this.scheduleModerationPersist(sessionId, moderationState.queue);
    this.emitModerationQueueUpdated(sessionId, moderationState.queue);
    return clone(moderationState.queue);
  },

  scheduleModerationPersist(sessionId, queueState) {
    if (!this.moderationQueueStore || this.hydratingModerationQueues) {
      return;
    }

    const payload = clone(queueState);
    Promise.resolve()
      .then(() => this.moderationQueueStore.saveQueue(sessionId, payload))
      .catch((error) => {
        log("error", "Failed to persist moderation queue state", {
          sessionId,
          message: error.message
        });
      });
  },

  onModerationQueueUpdated(listener) {
    if (typeof listener !== "function") {
      throw new Error("session_memory_requires_moderation_listener");
    }
    this.moderationQueueListeners.add(listener);
    return () => {
      this.moderationQueueListeners.delete(listener);
    };
  },

  emitModerationQueueUpdated(sessionId, queueState) {
    if (!queueState || this.moderationQueueListeners.size === 0) {
      return;
    }

    for (const listener of this.moderationQueueListeners) {
      try {
        listener(sessionId, clone(queueState));
      } catch (error) {
        log("error", "moderation_queue_listener_failed", {
          sessionId,
          message: error.message
        });
      }
    }
  },

  listModerationQueues() {
    return Array.from(this.sessions.values()).map((session) => {
      const moderationState = ensureModerationState(session);
      const stats = {
        totalAlerts: moderationState.alerts.length,
        live: 0,
        queued: 0,
        escalated: 0,
        resolved: 0
      };

      moderationState.alerts.forEach((alert) => {
        switch (alert.status) {
          case "live":
            stats.live += 1;
            break;
          case "queued":
            stats.queued += 1;
            break;
          case "escalated":
            stats.escalated += 1;
            break;
          case "resolved":
            stats.resolved += 1;
            break;
          default:
            break;
        }
      });

      return {
        sessionId: session.sessionId,
        player: clone(session.player),
        closedAt: session.closedAt || null,
        queue: clone(moderationState.queue),
        stats,
        lastOfflineWorkflowRun: clone(session.lastOfflineWorkflowRun || null)
      };
    });
  },

  getModerationState(sessionId) {
    const session = this.ensureSession(sessionId);
    const moderation = ensureModerationState(session);
    const alerts = moderation.alerts.map((alert) => clone(alert));
    const decisions = moderation.decisions.map((decision) => clone(decision));
    const stats = {
      totalAlerts: alerts.length,
      live: 0,
      queued: 0,
      escalated: 0,
      resolved: 0
    };

    alerts.forEach((alert) => {
      switch (alert.status) {
        case "live":
          stats.live += 1;
          break;
        case "queued":
          stats.queued += 1;
          break;
        case "escalated":
          stats.escalated += 1;
          break;
        case "resolved":
          stats.resolved += 1;
          break;
        default:
          break;
      }
    });

    const queueState = moderation.queue
      ? {
          generatedAt: moderation.queue.generatedAt || null,
          updatedAt: moderation.queue.updatedAt || null,
          pendingCount: moderation.queue.pendingCount || 0,
          items: Array.isArray(moderation.queue.items)
            ? moderation.queue.items.map((item) => clone(item))
            : [],
          window: moderation.queue.window ? clone(moderation.queue.window) : null,
          cadence: moderation.queue.cadence ? clone(moderation.queue.cadence) : null
        }
      : {
          generatedAt: null,
          updatedAt: null,
          pendingCount: 0,
          items: [],
          window: null,
          cadence: null
        };

    return {
      sessionId,
      alerts,
      decisions,
      stats,
      queue: queueState
    };
  },

  recordOfflineWorkflowRun(sessionId, run = {}) {
    const session = this.ensureSession(sessionId);
    if (!Array.isArray(session.offlineWorkflowHistory)) {
      session.offlineWorkflowHistory = [];
    }

    const entry = {
      jobId: run.jobId || null,
      auditRef: run.auditRef || null,
      status: run.status || "completed",
      startedAt: run.startedAt ? toIsoTimestamp(run.startedAt) : null,
      completedAt: run.completedAt ? toIsoTimestamp(run.completedAt) : null,
      durationMs:
        typeof run.durationMs === "number" && run.durationMs >= 0 ? run.durationMs : null,
      summaryVersion:
        run.summaryVersion !== undefined ? run.summaryVersion : null,
      mentionCount:
        typeof run.mentionCount === "number" ? run.mentionCount : null,
      deltaCount: typeof run.deltaCount === "number" ? run.deltaCount : null,
      publishingBatchId: run.publishingBatchId || null,
      publishingStatus: run.publishingStatus || null,
      requiresModeration: Boolean(run.requiresModeration),
      moderationReasons: Array.isArray(run.moderationReasons)
        ? [...run.moderationReasons]
        : [],
      moderationCapabilityViolations:
        typeof run.moderationCapabilityViolations === "number"
          ? run.moderationCapabilityViolations
          : 0,
      moderationConflictDetections:
        typeof run.moderationConflictDetections === "number"
          ? run.moderationConflictDetections
          : 0,
      moderationLowConfidence:
        typeof run.moderationLowConfidence === "number" ? run.moderationLowConfidence : 0,
      moderationPendingCount:
        typeof run.moderationPendingCount === "number" ? run.moderationPendingCount : 0,
      error: run.error || null
    };

    session.offlineWorkflowHistory.push(entry);
    if (session.offlineWorkflowHistory.length > 50) {
      session.offlineWorkflowHistory.shift();
    }

    session.lastOfflineWorkflowRun = entry;
    return entry;
  },

  markOfflineReconciled(sessionId, options = {}) {
    const session = this.ensureSession(sessionId);
    const reconciledAt = toIsoTimestamp(options.reconciledAt);
    session.lastAckCursor = session.changeCursor;
    session.pendingOfflineReconcile = false;
    session.offlineReconciledAt = reconciledAt;
    session.offlineReconcileAuditRef = options.auditRef || session.lastClosureAuditRef || null;

    if (session.lastOfflineWorkflowRun) {
      session.lastOfflineWorkflowRun.status =
        options.status || session.lastOfflineWorkflowRun.status || "completed";
      session.lastOfflineWorkflowRun.completedAt =
        session.lastOfflineWorkflowRun.completedAt || reconciledAt;
      if (options.summaryVersion !== undefined) {
        session.lastOfflineWorkflowRun.summaryVersion =
          session.lastOfflineWorkflowRun.summaryVersion ?? options.summaryVersion;
      }
      session.lastOfflineWorkflowRun.durationMs =
        typeof options.durationMs === "number"
          ? options.durationMs
          : session.lastOfflineWorkflowRun.durationMs;
      session.lastOfflineWorkflowRun.reconciledAt = reconciledAt;
    }

    if (Array.isArray(session.offlineWorkflowHistory) && session.offlineWorkflowHistory.length > 0) {
      const lastIndex = session.offlineWorkflowHistory.length - 1;
      const last = session.offlineWorkflowHistory[lastIndex];
      if (last === session.lastOfflineWorkflowRun) {
        last.status = session.lastOfflineWorkflowRun.status;
        last.completedAt = session.lastOfflineWorkflowRun.completedAt;
        last.durationMs = session.lastOfflineWorkflowRun.durationMs;
        last.reconciledAt = reconciledAt;
        if (options.summaryVersion !== undefined) {
          last.summaryVersion = last.summaryVersion ?? options.summaryVersion;
        }
      }
    }

    return {
      sessionId,
      reconciledAt,
      pendingOfflineReconcile: session.pendingOfflineReconcile
    };
  }
};

export {
  adminMemoryMixin,
  createInitialModerationState,
  ensureModerationState
};
