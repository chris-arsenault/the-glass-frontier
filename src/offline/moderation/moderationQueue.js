"use strict";

function toIso(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return null;
}

function numericCountdown(targetIso, now) {
  if (!targetIso) {
    return null;
  }

  const target = new Date(targetIso);
  if (Number.isNaN(target.getTime())) {
    return null;
  }

  const delta = target.getTime() - now.getTime();
  return delta < 0 ? 0 : delta;
}

function cloneBatch(batch) {
  return {
    batchId: batch.batchId,
    type: batch.type || "hourly",
    runAt: batch.runAt || null,
    status: batch.status || "scheduled",
    preparedAt: batch.preparedAt || null,
    publishedAt: batch.publishedAt || null,
    deltaCount: batch.deltaCount !== undefined ? batch.deltaCount : null,
    latencyMs: batch.latencyMs !== undefined ? batch.latencyMs : null,
    notes: batch.notes || null,
    override: batch.override ? { ...batch.override } : null
  };
}

function buildModerationQueueState({ sessionId, deltas = [], schedule = null, clock } = {}) {
  if (!sessionId) {
    throw new Error("moderation_queue_state_requires_session");
  }

  const now = clock ? clock() : new Date();
  const reference = now instanceof Date ? now : new Date(now);
  const generatedAt = reference.toISOString();

  const moderationWindow = schedule?.moderation || {};
  const batches = Array.isArray(schedule?.batches) ? schedule.batches : [];
  const digest = schedule?.digest || null;

  const pendingItems = deltas
    .filter((delta) => delta?.safety?.requiresModeration)
    .map((delta) => {
      const reasons = Array.isArray(delta.safety.reasons)
        ? Array.from(new Set(delta.safety.reasons.map((reason) => String(reason))))
        : [];

      const conflicts = Array.isArray(delta.safety.conflicts)
        ? delta.safety.conflicts.map((conflict) => ({ ...conflict }))
        : [];

      const capabilityViolations = Array.isArray(delta.capabilityRefs)
        ? delta.capabilityRefs.slice()
        : [];

      const status = delta.status || "needs-review";
      const blocking = status !== "resolved";

      return {
        deltaId: delta.deltaId,
        sessionId,
        entityId: delta.entityId || null,
        entityType: delta.entityType || null,
        canonicalName: delta.canonicalName || null,
        createdAt: toIso(delta.createdAt) || generatedAt,
        status,
        blocking,
        reasons,
        capabilityViolations,
        confidenceTier: delta.safety.confidence || null,
        conflicts,
        proposedChanges: delta.proposedChanges ? { ...delta.proposedChanges } : null,
        before: delta.before ? { ...delta.before } : null,
        after: delta.after ? { ...delta.after } : null,
        countdownMs: numericCountdown(moderationWindow.endAt, reference),
        deadlineAt: moderationWindow.endAt || null,
        windowStartAt: moderationWindow.startAt || null,
        escalationsAt: Array.isArray(moderationWindow.escalations)
          ? moderationWindow.escalations.slice()
          : [],
        moderationDecisionId: null,
        resolvedAt: null,
        decisionActor: null,
        notes: null
      };
    });

  const pendingCount = pendingItems.filter((item) => item.blocking).length;

  return {
    sessionId,
    generatedAt,
    pendingCount,
    items: pendingItems,
    window: {
      status: moderationWindow.status || (pendingCount > 0 ? "awaiting_review" : "clear"),
      startAt: moderationWindow.startAt || null,
      endAt: moderationWindow.endAt || null,
      escalations: Array.isArray(moderationWindow.escalations)
        ? moderationWindow.escalations.slice()
        : [],
      notes: moderationWindow.notes || null,
      updatedAt: moderationWindow.updatedAt || generatedAt
    },
    cadence: {
      nextBatchAt: batches.length > 0 ? batches[0].runAt || null : null,
      nextDigestAt: digest?.runAt || null,
      batches: batches.map(cloneBatch),
      digest: digest
        ? {
            runAt: digest.runAt || null,
            status: digest.status || "scheduled",
            notes: digest.notes || null
          }
        : null
    }
  };
}

module.exports = {
  buildModerationQueueState
};
