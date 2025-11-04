"use strict";

const { v4: uuid } = require("uuid");
const { PublishingStateStore } = require("./publishingStateStore");

const DEFAULT_CONFIG = {
  moderationDelayMinutes: 15,
  moderationWindowMinutes: 45,
  moderationEscalationMinutes: [30, 40],
  loreBatchDelayMinutes: 60,
  digestHour: 2,
  digestMinute: 0,
  timezoneOffsetMinutes: 0,
  maxOverrideDeferMinutes: 12 * 60
};

function minutesToMs(minutes) {
  return minutes * 60 * 1000;
}

function toIso(date) {
  return date.toISOString();
}

function resolveDate(source, fallback) {
  if (!source) {
    return new Date(fallback || Date.now());
  }

  const value = source instanceof Date ? source : new Date(source);
  if (Number.isNaN(value.getTime())) {
    throw new Error("publishing_cadence_invalid_date");
  }

  return value;
}

function computeDigestRun(reference, config) {
  const tzOffsetMs = minutesToMs(config.timezoneOffsetMinutes || 0);
  const localReference = new Date(reference.getTime() + tzOffsetMs);
  const localDigest = new Date(localReference);

  localDigest.setUTCHours(config.digestHour, config.digestMinute || 0, 0, 0);
  if (localDigest <= localReference) {
    localDigest.setUTCDate(localDigest.getUTCDate() + 1);
  }

  return new Date(localDigest.getTime() - tzOffsetMs);
}

class PublishingCadence {
  constructor(options = {}) {
    this.clock = options.clock || (() => new Date());
    this.config = Object.assign({}, DEFAULT_CONFIG, options.config || {});
    this.stateStore = options.stateStore || new PublishingStateStore({ clock: this.clock });
  }

  planForSession({ sessionId, sessionClosedAt, config } = {}) {
    if (!sessionId) {
      throw new Error("publishing_cadence_requires_session_id");
    }

    const effectiveConfig = Object.assign({}, this.config, config || {});
    const generatedAt = toIso(this.clock());
    const closedAt = resolveDate(sessionClosedAt, this.clock());
    const moderationStart = new Date(
      closedAt.getTime() + minutesToMs(effectiveConfig.moderationDelayMinutes)
    );
    const moderationEnd = new Date(
      moderationStart.getTime() + minutesToMs(effectiveConfig.moderationWindowMinutes)
    );
    const loreBatchRunAt = new Date(
      closedAt.getTime() + minutesToMs(effectiveConfig.loreBatchDelayMinutes)
    );

    const digestRunAt = computeDigestRun(closedAt, effectiveConfig);

    const schedule = {
      sessionClosedAt: toIso(closedAt),
      moderation: {
        startAt: toIso(moderationStart),
        endAt: toIso(moderationEnd),
        escalations: (effectiveConfig.moderationEscalationMinutes || []).map((offsetMinutes) => {
          return toIso(
            new Date(moderationStart.getTime() + minutesToMs(Number(offsetMinutes || 0)))
          );
        }),
        status: "scheduled",
        pendingCount: 0,
        reasons: [],
        deltaCount: 0,
        notes: null,
        updatedAt: generatedAt
      },
      batches: [
        {
          batchId: `${sessionId}-batch-0`,
          type: "hourly",
          runAt: toIso(loreBatchRunAt),
          status: "scheduled"
        }
      ],
      digest: {
        runAt: toIso(digestRunAt),
        status: "scheduled"
      },
      overrides: []
    };

    const existing = this.stateStore.getSession(sessionId);

    if (existing) {
      this.stateStore.updateSession(sessionId, (state) => {
        state.sessionClosedAt = schedule.sessionClosedAt;
        state.moderation = schedule.moderation;
        state.batches = schedule.batches;
        state.digest = schedule.digest;
        state.overrides = [];
        return state;
      });
      this.stateStore.appendHistory(sessionId, {
        type: "cadence.reinitialised",
        payload: {
          sessionClosedAt: schedule.sessionClosedAt,
          moderationStartAt: schedule.moderation.startAt,
          loreBatchRunAt: schedule.batches[0].runAt,
          digestRunAt: schedule.digest.runAt
        }
      });
      return this.stateStore.getSession(sessionId);
    }

    this.stateStore.createSession(sessionId, schedule);
    this.stateStore.appendHistory(sessionId, {
      type: "cadence.initialised",
      payload: {
        sessionClosedAt: schedule.sessionClosedAt,
        moderationStartAt: schedule.moderation.startAt,
        loreBatchRunAt: schedule.batches[0].runAt,
        digestRunAt: schedule.digest.runAt
      }
    });

    return this.stateStore.getSession(sessionId);
  }

  getSchedule(sessionId) {
    return this.stateStore.getSession(sessionId);
  }

  applyOverride(sessionId, override = {}) {
    const schedule = this.stateStore.getSession(sessionId);
    if (!schedule) {
      throw new Error("publishing_override_session_missing");
    }

    const target = override.target || "loreBatch";
    if (target !== "loreBatch") {
      throw new Error("publishing_override_target_unsupported");
    }

    const batchIndex = override.batchIndex || 0;
    const batch = schedule.batches[batchIndex];
    if (!batch) {
      throw new Error("publishing_override_batch_missing");
    }

    const currentRunAt = resolveDate(batch.runAt);
    const deferUntil = override.deferUntil
      ? resolveDate(override.deferUntil)
      : new Date(
          currentRunAt.getTime() +
            minutesToMs(Number.isFinite(override.deferByMinutes) ? override.deferByMinutes : 0)
        );

    if (deferUntil <= currentRunAt) {
      throw new Error("publishing_override_requires_future_time");
    }

    const maxDeferMs = minutesToMs(this.config.maxOverrideDeferMinutes);
    if (deferUntil.getTime() - currentRunAt.getTime() > maxDeferMs) {
      throw new Error("publishing_override_exceeds_limit");
    }

    const overrideRecord = {
      overrideId: uuid(),
      target: "loreBatch",
      batchId: batch.batchId,
      actor: override.actor || "admin.system",
      reason: override.reason || null,
      appliedAt: toIso(this.clock()),
      deferUntil: toIso(deferUntil)
    };

    this.stateStore.updateSession(sessionId, (state) => {
      const targetBatch = state.batches[batchIndex];
      targetBatch.runAt = overrideRecord.deferUntil;
      targetBatch.override = overrideRecord;
      state.overrides.push(overrideRecord);
      return state;
    });

    this.stateStore.appendHistory(sessionId, {
      type: "cadence.override.applied",
      payload: overrideRecord
    });

    return this.stateStore.getSession(sessionId);
  }

  updateBatchStatus(sessionId, batchId, status, metadata = {}) {
    if (!batchId || !status) {
      throw new Error("publishing_batch_status_requires_identifiers");
    }

    const normalizedMeta = normalizeBatchMetadata(metadata);
    this.stateStore.updateSession(sessionId, (state) => {
      const batch = state.batches.find((entry) => entry.batchId === batchId);
      if (!batch) {
        throw new Error("publishing_batch_missing");
      }

      batch.status = status;
      if (normalizedMeta.preparedAt) {
        batch.preparedAt = normalizedMeta.preparedAt;
      }
      if (normalizedMeta.publishedAt) {
        batch.publishedAt = normalizedMeta.publishedAt;
      }
      if (normalizedMeta.deltaCount !== undefined) {
        batch.deltaCount = normalizedMeta.deltaCount;
      }
      if (normalizedMeta.latencyMs !== undefined) {
        batch.latencyMs = normalizedMeta.latencyMs;
      }
      if (normalizedMeta.notes) {
        batch.notes = normalizedMeta.notes;
      }
      return state;
    });

    this.stateStore.appendHistory(sessionId, {
      type: "cadence.batch.status",
      payload: {
        batchId,
        status,
        metadata: normalizedMeta
      }
    });

    return this.stateStore.getSession(sessionId);
  }

  updateModerationStatus(sessionId, status, metadata = {}) {
    if (!sessionId) {
      throw new Error("publishing_moderation_status_requires_session");
    }
    if (!status) {
      throw new Error("publishing_moderation_status_requires_value");
    }

    const normalizedMeta = normalizeModerationMetadata(metadata, this.clock);

    this.stateStore.updateSession(sessionId, (state) => {
      if (!state.moderation) {
        throw new Error("publishing_moderation_schedule_missing");
      }

      state.moderation.status = status;
      if (normalizedMeta.pendingCount !== undefined) {
        state.moderation.pendingCount = normalizedMeta.pendingCount;
      }
      if (normalizedMeta.reasons) {
        state.moderation.reasons = normalizedMeta.reasons;
      }
      if (normalizedMeta.deltaCount !== undefined) {
        state.moderation.deltaCount = normalizedMeta.deltaCount;
      }
      if (normalizedMeta.moderationDecisionId !== undefined) {
        state.moderation.moderationDecisionId = normalizedMeta.moderationDecisionId;
      }
      if (normalizedMeta.notes !== undefined) {
        state.moderation.notes = normalizedMeta.notes;
      }
      state.moderation.updatedAt = normalizedMeta.updatedAt;
      return state;
    });

    this.stateStore.appendHistory(sessionId, {
      type: "cadence.moderation.status",
      payload: {
        status,
        pendingCount: normalizedMeta.pendingCount,
        reasons: normalizedMeta.reasons,
        deltaCount: normalizedMeta.deltaCount,
        moderationDecisionId: normalizedMeta.moderationDecisionId,
        notes: normalizedMeta.notes,
        updatedAt: normalizedMeta.updatedAt
      }
    });

    return this.stateStore.getSession(sessionId);
  }
}

function normalizeBatchMetadata(metadata) {
  if (!metadata) {
    return {};
  }

  const normalized = {};
  if (metadata.preparedAt) {
    normalized.preparedAt = toIso(resolveDate(metadata.preparedAt));
  }
  if (metadata.publishedAt) {
    normalized.publishedAt = toIso(resolveDate(metadata.publishedAt));
  }
  if (typeof metadata.deltaCount === "number") {
    normalized.deltaCount = metadata.deltaCount;
  }
  if (typeof metadata.latencyMs === "number") {
    normalized.latencyMs = metadata.latencyMs;
  }
  if (metadata.notes) {
    normalized.notes = metadata.notes;
  }

  return normalized;
}

function normalizeModerationMetadata(metadata, clock) {
  const normalized = {};
  if (typeof metadata.pendingCount === "number") {
    normalized.pendingCount = metadata.pendingCount;
  }
  if (Array.isArray(metadata.reasons)) {
    const reasonSet = new Set();
    metadata.reasons.forEach((reason) => {
      if (reason !== undefined && reason !== null) {
        reasonSet.add(String(reason));
      }
    });
    normalized.reasons = Array.from(reasonSet);
  }
  if (typeof metadata.deltaCount === "number") {
    normalized.deltaCount = metadata.deltaCount;
  }
  if (metadata.moderationDecisionId !== undefined) {
    normalized.moderationDecisionId = metadata.moderationDecisionId;
  }
  if (metadata.notes !== undefined) {
    normalized.notes = metadata.notes;
  }

  const now = clock ? clock() : new Date();
  const timestamp = now instanceof Date ? now : new Date(now);
  normalized.updatedAt = timestamp.toISOString();

  return normalized;
}

module.exports = {
  PublishingCadence,
  DEFAULT_CONFIG
};
