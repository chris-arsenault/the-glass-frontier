"use strict";

const crypto = require("crypto");
const { PublishingCadence } = require("../offline/publishing/publishingCadence");

function isoNow(clock = () => new Date()) {
  return clock().toISOString();
}

function clone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function formatCadenceReminder(schedule) {
  if (!schedule || !schedule.digest) {
    return null;
  }

  const digestAt = schedule.digest.runAt;
  const batch = Array.isArray(schedule.batches) ? schedule.batches[0] : null;
  const moderation = schedule.moderation;

  return {
    nextDigestAt: digestAt,
    nextBatchAt: batch ? batch.runAt : null,
    moderationWindow: moderation
      ? {
          startAt: moderation.startAt,
          endAt: moderation.endAt,
          escalations: moderation.escalations || []
        }
      : null
  };
}

class SessionDirectory {
  constructor(options = {}) {
    if (!options.sessionMemory) {
      throw new Error("session_directory_requires_memory");
    }

    this.clock = options.clock || (() => new Date());
    this.sessionMemory = options.sessionMemory;
    this.publishingCadence =
      options.publishingCadence ||
      new PublishingCadence({
        clock: options.clock
      });
    this.sessions = new Map();
    this.accountSessions = new Map();
  }

  registerSession(accountId, options = {}) {
    if (!accountId) {
      throw new Error("session_directory_requires_account");
    }

    const sessionId = options.sessionId || `session-${crypto.randomUUID().slice(0, 8)}`;
    const existing = this.sessions.get(sessionId);
    if (existing && existing.accountId !== accountId) {
      throw new Error("session_directory_session_in_use");
    }

    const createdAt = isoNow(this.clock);
    const title = options.title || "Frontier Session";
    const status = options.status || "active";
    const lastClosedAt =
      options.lastClosedAt || new Date(this.clock().getTime() - 5 * 60 * 1000).toISOString();

    const cadence = this.publishingCadence.planForSession({
      sessionId,
      sessionClosedAt: lastClosedAt
    });

    const record = {
      sessionId,
      accountId,
      title,
      status,
      createdAt,
      updatedAt: createdAt,
      lastActiveAt: createdAt,
      lastClosedAt,
      requiresApproval: Boolean(options.requiresApproval),
      approvedBy: options.approvedBy || null,
      cadence,
      labels: Array.isArray(options.labels) ? Array.from(new Set(options.labels)) : []
    };

    if (typeof this.sessionMemory.ensureSession === "function") {
      this.sessionMemory.ensureSession(sessionId);
    } else if (typeof this.sessionMemory.getSessionState === "function") {
      this.sessionMemory.getSessionState(sessionId);
    }
    this.sessions.set(sessionId, record);
    this.linkAccountSession(accountId, sessionId);

    return this.buildSummary(record);
  }

  resumeSession(accountId, sessionId) {
    const record = this.getOwnedSession(accountId, sessionId);
    record.status = "active";
    record.lastActiveAt = isoNow(this.clock);
    record.updatedAt = record.lastActiveAt;
    this.sessions.set(sessionId, record);
    return this.buildSummary(record);
  }

  closeSession(accountId, sessionId, options = {}) {
    const record = this.getOwnedSession(accountId, sessionId);
    const closedAt = isoNow(this.clock);
    record.status = "closed";
    record.lastActiveAt = closedAt;
    record.updatedAt = closedAt;
    record.lastClosedAt = closedAt;
    record.cadence = this.publishingCadence.planForSession({
      sessionId,
      sessionClosedAt: closedAt
    });

    this.sessionMemory.markSessionClosed(sessionId, {
      closedAt,
      closedBy: options.closedBy || accountId,
      reason: options.reason,
      auditRef: options.auditRef
    });

    this.sessions.set(sessionId, record);
    return this.buildSummary(record);
  }

  approveSession(accountId, sessionId, actorAccount) {
    const record = this.getOwnedSession(accountId, sessionId);
    record.requiresApproval = false;
    record.approvedBy = actorAccount ? actorAccount.id : null;
    record.updatedAt = isoNow(this.clock);
    this.sessions.set(sessionId, record);
    return this.buildSummary(record);
  }

  listSessions(accountId) {
    const sessionIds = this.accountSessions.get(accountId);
    if (!sessionIds) {
      return [];
    }

    return Array.from(sessionIds)
      .map((sessionId) => this.sessions.get(sessionId))
      .filter(Boolean)
      .map((record) => this.buildSummary(record))
      .sort((a, b) => {
        const left = a.updatedAt || a.lastActiveAt || a.createdAt;
        const right = b.updatedAt || b.lastActiveAt || b.createdAt;
        return right.localeCompare(left);
      });
  }

  getOwnedSession(accountId, sessionId) {
    const record = this.sessions.get(sessionId);
    if (!record || record.accountId !== accountId) {
      throw new Error("session_directory_access_denied");
    }
    return record;
  }

  linkAccountSession(accountId, sessionId) {
    if (!this.accountSessions.has(accountId)) {
      this.accountSessions.set(accountId, new Set());
    }
    this.accountSessions.get(accountId).add(sessionId);
  }

  buildSummary(record) {
    const sessionState = this.sessionMemory.getSessionState(record.sessionId);
    const momentum = sessionState?.shards?.momentum?.data || {};
    const character = sessionState?.shards?.character?.data || {};
    const offlinePending = Boolean(sessionState?.pendingOfflineReconcile);
    const offlineLastRun = sessionState?.lastOfflineWorkflowRun
      ? {
          status: sessionState.lastOfflineWorkflowRun.status || "unknown",
          completedAt: sessionState.lastOfflineWorkflowRun.completedAt || null,
          durationMs: sessionState.lastOfflineWorkflowRun.durationMs || null,
          summaryVersion:
            sessionState.lastOfflineWorkflowRun.summaryVersion !== undefined
              ? sessionState.lastOfflineWorkflowRun.summaryVersion
              : null
        }
      : null;
    const cadenceSummary = formatCadenceReminder(record.cadence);

    return {
      sessionId: record.sessionId,
      title: record.title,
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      lastActiveAt: record.lastActiveAt,
      requiresApproval: record.requiresApproval,
      approvedBy: record.approvedBy,
      labels: record.labels,
      cadence: cadenceSummary,
      momentum: {
        current: typeof momentum.current === "number" ? momentum.current : 0,
        baseline: typeof momentum.baseline === "number" ? momentum.baseline : 0
      },
      characterName: character.name || "Frontier Runner",
      offlinePending,
      offlineReconciledAt: sessionState?.offlineReconciledAt || null,
      offlineLastRun,
      pendingWrapTurns:
        sessionState?.controls?.length > 0
          ? sessionState.controls[sessionState.controls.length - 1]
          : null
    };
  }
}

module.exports = {
  SessionDirectory
};
