"use strict";

import { log  } from "../utils/logger.js";

function toNumber(value, fallback = null) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }
  return value;
}

function toPositiveNumber(value, fallback = null) {
  const numeric = toNumber(value, fallback);
  if (numeric === null) {
    return fallback;
  }
  return numeric >= 0 ? numeric : fallback;
}

class ContestMetrics {
  constructor({ clock = Date, logger = log } = {}) {
    this.clock = clock;
    this.pendingByKey = new Map();
    this.activeById = new Map();
    this.log = typeof logger === "function" ? logger : log;
  }

  recordArmed({
    hubId,
    roomId,
    contestKey,
    participantCount,
    participantCapacity,
    createdAt,
    expiresAt,
    label,
    move,
    type
  }) {
    const normalizedCreatedAt = toPositiveNumber(createdAt, this.#now());
    const normalizedExpiresAt = toPositiveNumber(expiresAt, null);
    const key = this.#pendingKey({ hubId, roomId, contestKey });
    this.pendingByKey.set(key, {
      hubId,
      roomId,
      contestKey,
      participantCount: toPositiveNumber(participantCount, 1),
      participantCapacity: toPositiveNumber(participantCapacity, null),
      createdAt: normalizedCreatedAt,
      expiresAt: normalizedExpiresAt,
      windowMs:
        normalizedExpiresAt !== null && normalizedCreatedAt !== null
          ? Math.max(0, normalizedExpiresAt - normalizedCreatedAt)
          : null,
      label: label || null,
      move: move || null,
      type: type || null
    });

    this.log("info", "telemetry.contest.armed", {
      hubId,
      roomId,
      contestKey,
      participantCount: toPositiveNumber(participantCount, 1),
      participantCapacity: toPositiveNumber(participantCapacity, null),
      windowMs:
        this.pendingByKey.get(key)?.expiresAt !== null && normalizedCreatedAt !== null
          ? Math.max(0, this.pendingByKey.get(key).expiresAt - normalizedCreatedAt)
          : null,
      label: label || null,
      move: move || null,
      type: type || null
    });
  }

  recordLaunched({
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
    if (!contestId) {
      return;
    }

    const key = this.#pendingKey({ hubId, roomId, contestKey });
    const pending = this.pendingByKey.get(key);

    const normalizedCreatedAt =
      toPositiveNumber(createdAt, null) ??
      (pending ? toPositiveNumber(pending.createdAt, null) : null) ??
      this.#now();

    const normalizedStartedAt = toPositiveNumber(startedAt, null) ?? this.#now();
    const armedAt = normalizedCreatedAt !== null ? normalizedCreatedAt : normalizedStartedAt;

    const participantCapacityValue =
      toPositiveNumber(participantCapacity, null) ??
      (pending ? toPositiveNumber(pending.participantCapacity, null) : null);

    const record = {
      hubId,
      roomId,
      contestId,
      contestKey,
      participantCount: toPositiveNumber(participantCount, pending?.participantCount || 0),
      participantCapacity: participantCapacityValue,
      createdAt: normalizedCreatedAt,
      startedAt: normalizedStartedAt,
      label: label || pending?.label || null,
      move: move || pending?.move || null,
      type: type || pending?.type || null
    };

    this.activeById.set(contestId, record);
    this.pendingByKey.delete(key);

    this.log("info", "telemetry.contest.launched", {
      hubId,
      roomId,
      contestId,
      contestKey,
      participantCount: record.participantCount,
      participantCapacity: record.participantCapacity,
      armingDurationMs:
        armedAt !== null && normalizedStartedAt !== null
          ? Math.max(0, normalizedStartedAt - armedAt)
          : null,
      label: record.label,
      move: record.move,
      type: record.type
    });
  }

  recordWorkflowStarted({ hubId, roomId, contestId, contestKey, workflowId, runId }) {
    this.log("info", "telemetry.contest.workflowStarted", {
      hubId,
      roomId,
      contestId,
      contestKey,
      workflowId: workflowId || null,
      runId: runId || null
    });
  }

  recordWorkflowFailed({ hubId, roomId, contestId, contestKey, error }) {
    this.log("error", "telemetry.contest.workflowFailed", {
      hubId,
      roomId,
      contestId,
      contestKey,
      error: error || "workflow_failed"
    });
  }

  recordResolved({
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
    const record = this.activeById.get(contestId) || {
      hubId,
      roomId,
      contestId,
      contestKey,
      participantCount: toPositiveNumber(participantCount, null),
      participantCapacity: toPositiveNumber(participantCapacity, null),
      createdAt: toPositiveNumber(createdAt, null),
      startedAt: toPositiveNumber(startedAt, null)
    };

    const normalizedResolvedAt = toPositiveNumber(resolvedAt, null) ?? this.#now();
    const normalizedStartedAt =
      toPositiveNumber(startedAt, null) ??
      toPositiveNumber(record.startedAt, null) ??
      normalizedResolvedAt;

    const normalizedCreatedAt =
      toPositiveNumber(createdAt, null) ??
      toPositiveNumber(record.createdAt, null) ??
      normalizedStartedAt;

    const participantCountValue =
      toPositiveNumber(participantCount, null) ??
      toPositiveNumber(record.participantCount, null);
    const participantCapacityValue =
      toPositiveNumber(participantCapacity, null) ??
      toPositiveNumber(record.participantCapacity, null);

    const armingDurationMs =
      normalizedCreatedAt !== null && normalizedStartedAt !== null
        ? Math.max(0, normalizedStartedAt - normalizedCreatedAt)
        : null;
    const resolutionDurationMs =
      normalizedStartedAt !== null && normalizedResolvedAt !== null
        ? Math.max(0, normalizedResolvedAt - normalizedStartedAt)
        : null;

    this.log("info", "telemetry.contest.resolved", {
      hubId,
      roomId,
      contestId,
      contestKey,
      participantCount: participantCountValue,
      participantCapacity: participantCapacityValue,
      outcomeTier: outcome?.tier || null,
      sharedComplicationCount: toPositiveNumber(sharedComplicationCount, 0),
      armingDurationMs,
      resolutionDurationMs
    });

    this.activeById.delete(contestId);
  }

  recordExpired({
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
    const key = this.#pendingKey({ hubId, roomId, contestKey });
    const pending = this.pendingByKey.get(key);

    const normalizedExpiredAt = toPositiveNumber(expiredAt, this.#now());
    const normalizedCreatedAt =
      toPositiveNumber(createdAt, null) ??
      (pending ? toPositiveNumber(pending.createdAt, null) : null) ??
      null;

    const participantCountValue =
      toPositiveNumber(participantCount, null) ??
      (pending ? toPositiveNumber(pending.participantCount, null) : null);

    const participantCapacityValue =
      toPositiveNumber(participantCapacity, null) ??
      (pending ? toPositiveNumber(pending.participantCapacity, null) : null);

    const resolvedWindowMs =
      toPositiveNumber(windowMs, null) ??
      (pending ? toPositiveNumber(pending.windowMs, null) : null);

    const armingDurationMs =
      normalizedCreatedAt !== null && normalizedExpiredAt !== null
        ? Math.max(0, normalizedExpiredAt - normalizedCreatedAt)
        : null;

    this.pendingByKey.delete(key);

    this.log("info", "telemetry.contest.expired", {
      hubId,
      roomId,
      contestKey,
      participantCount: participantCountValue,
      participantCapacity: participantCapacityValue,
      label: label || pending?.label || null,
      move: move || pending?.move || null,
      type: type || pending?.type || null,
      expiredAt: normalizedExpiredAt,
      windowMs: resolvedWindowMs,
      armingDurationMs
    });
  }

  recordRematchCooling({
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
    this.log("info", "telemetry.contest.rematchCooling", {
      hubId,
      roomId,
      contestKey,
      cooldownMs: toPositiveNumber(cooldownMs, null),
      availableAt: toPositiveNumber(availableAt, null),
      expiredAt: toPositiveNumber(expiredAt, null),
      participantCount: toPositiveNumber(participantCount, null),
      severity: severity || null,
      missingParticipants: toPositiveNumber(missingParticipants, null)
    });
  }

  recordRematchBlocked({
    hubId,
    roomId,
    contestKey,
    actorId,
    remainingMs,
    cooldownMs
  }) {
    this.log("info", "telemetry.contest.rematchBlocked", {
      hubId,
      roomId,
      contestKey,
      actorId: actorId || null,
      remainingMs: toPositiveNumber(remainingMs, 0),
      cooldownMs: toPositiveNumber(cooldownMs, null)
    });
  }

  recordSentimentSample({
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
    this.log("info", "telemetry.contest.sentiment", {
      hubId,
      roomId,
      contestKey,
      actorId: actorId || null,
      sentiment: sentiment || "neutral",
      tone: tone || "neutral",
      phase: phase || "post-expiration",
      messageLength: toPositiveNumber(messageLength, 0),
      remainingCooldownMs: toPositiveNumber(remainingCooldownMs, 0),
      cooldownMs: toPositiveNumber(cooldownMs, null),
      issuedAt: toPositiveNumber(issuedAt, null)
    });
  }

  recordTimingFallback({ hubId, roomId, contestId, timings }) {
    this.log("warn", "telemetry.contest.timingFallback", {
      hubId,
      roomId,
      contestId,
      timings: timings || null
    });
  }

  #pendingKey({ hubId, roomId, contestKey }) {
    return `${hubId || "unknown"}:${roomId || "unknown"}:${contestKey || "unknown"}`;
  }

  #now() {
    return typeof this.clock.now === "function" ? this.clock.now() : Date.now();
  }
}

export {
  ContestMetrics
};
