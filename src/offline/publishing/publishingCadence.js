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
        status: "scheduled"
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

module.exports = {
  PublishingCadence,
  DEFAULT_CONFIG
};
