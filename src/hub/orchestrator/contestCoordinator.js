"use strict";

const { v4: uuidv4 } = require("uuid");

function clone(value) {
  return value === null || value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function uniqueActors(participants = []) {
  const set = new Set();
  participants.forEach((participant) => {
    if (participant?.actorId) {
      set.add(participant.actorId);
    }
  });
  return set;
}

function coerceTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
}

function coerceDuration(value) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  return null;
}

class ContestCoordinator {
  constructor({ clock = Date } = {}) {
    this.clock = clock;
    this.pendingByRoom = new Map();
    this.activeById = new Map();
  }

  expire({ roomId = null, now = null } = {}) {
    const timestamp =
      typeof now === "number" && Number.isFinite(now) && now >= 0 ? now : this.#now();
    const rooms = roomId ? [roomId] : Array.from(this.pendingByRoom.keys());
    const expired = [];

    rooms.forEach((candidateRoomId) => {
      const pending = this.pendingByRoom.get(candidateRoomId);
      if (!pending) {
        return;
      }
      for (const [contestKey, record] of pending.entries()) {
        const expiresAt =
          typeof record.expiresAt === "number" && Number.isFinite(record.expiresAt)
            ? record.expiresAt
            : null;
        if (expiresAt !== null && expiresAt <= timestamp) {
          pending.delete(contestKey);
          expired.push(this.#serializeExpired(record, timestamp));
        }
      }
      if (pending.size === 0) {
        this.pendingByRoom.delete(candidateRoomId);
      }
    });

    return expired;
  }

  register({ entry, issuedAt }) {
    const contestMetadata = entry?.metadata?.contest;
    if (!contestMetadata || !contestMetadata.contestKey) {
      return null;
    }

    const now = issuedAt || this.#now();
    const roomId = entry.roomId;
    if (!roomId) {
      return null;
    }

    this.#gc(roomId, now);

    const pending = this.#ensurePending(roomId, contestMetadata);
    const participant = this.#buildParticipant(entry, contestMetadata, now);
    this.#upsertParticipant(pending, participant, contestMetadata);

    const distinctActors = uniqueActors(pending.participants);
    const readyThreshold = Math.max(2, contestMetadata.maxParticipants || 2);
    const ready = distinctActors.size >= readyThreshold;

    if (!ready) {
      return {
        status: "arming",
        contestKey: pending.contestKey,
        state: this.#serializePending(pending)
      };
    }

    this.pendingByRoom.get(roomId).delete(pending.contestKey);
    const contestId = uuidv4();
    const participants = pending.participants.map((participantEntry, index) =>
      this.#assignParticipantRole(participantEntry, pending.roles, index)
    );
    const activeRecord = {
      contestId,
      contestKey: pending.contestKey,
      hubId: pending.hubId,
      roomId: pending.roomId,
      type: pending.type,
      move: pending.move,
      label: pending.label,
      checkTemplate: pending.checkTemplate,
      windowMs: pending.windowMs || null,
      participantCapacity: pending.participantCapacity || null,
      moderationTags: pending.moderationTags,
      sharedComplicationTags: pending.sharedComplicationTags,
      participants,
      createdAt: pending.createdAt,
      expiresAt: pending.expiresAt,
      startedAt: now
    };

    this.activeById.set(contestId, activeRecord);

    const bundle = {
      contestId,
      contestKey: pending.contestKey,
      hubId: pending.hubId,
      roomId: pending.roomId,
      type: pending.type,
      move: pending.move,
      checkTemplate: pending.checkTemplate,
      sessionId: entry.metadata?.sessionId || null,
      participantCapacity: pending.participantCapacity || null,
      createdAt: pending.createdAt,
      windowMs: pending.windowMs || null,
      participants: participants.map((participantEntry) => ({
        actorId: participantEntry.actorId,
        role: participantEntry.role,
        verbId: participantEntry.verbId,
        args: clone(participantEntry.args || {}),
        auditRef: participantEntry.auditRef || null,
        targetActorId: participantEntry.targetActorId || null
      })),
      metadata: {
        label: pending.label,
        moderationTags: pending.moderationTags,
        sharedComplicationTags: pending.sharedComplicationTags
      },
      startedAt: now
    };

    return {
      status: "started",
      contestId,
      contestKey: pending.contestKey,
      state: this.#serializeActive(activeRecord),
      bundle
    };
  }

  resolve(contestId, resolution = {}) {
    if (!contestId || !this.activeById.has(contestId)) {
      return null;
    }
    const record = this.activeById.get(contestId);
    const now = this.#now();
    const resolvedAt = this.#resolveResolvedAt(record, resolution, now);
    const resolvedRecord = {
      ...record,
      status: "resolved",
      resolvedAt,
      outcome: clone(resolution.outcome) || null,
      sharedComplications: Array.isArray(resolution.sharedComplications)
        ? resolution.sharedComplications.map((entry) => clone(entry))
        : [],
      participants: record.participants.map((participant) => {
        const participantResolution = Array.isArray(resolution.participants)
          ? resolution.participants.find((entry) => entry.actorId === participant.actorId)
          : null;
        return {
          ...participant,
          result: participantResolution ? clone(participantResolution) : null
        };
      })
    };
    this.activeById.set(contestId, resolvedRecord);
    return this.#serializeResolved(resolvedRecord);
  }

  #ensurePending(roomId, contestMetadata) {
    if (!this.pendingByRoom.has(roomId)) {
      this.pendingByRoom.set(roomId, new Map());
    }
    const roomPending = this.pendingByRoom.get(roomId);
    const existing = roomPending.get(contestMetadata.contestKey);
    if (existing) {
      return existing;
    }

    const windowMs =
      typeof contestMetadata.windowMs === "number" && contestMetadata.windowMs > 0
        ? contestMetadata.windowMs
        : 8000;

    const createdAt = this.#now();

    const record = {
      contestKey: contestMetadata.contestKey,
      hubId: contestMetadata.hubId,
      roomId,
      type: contestMetadata.type,
      move: contestMetadata.move,
      label: contestMetadata.label,
      checkTemplate: contestMetadata.checkTemplate,
      participantCapacity:
        typeof contestMetadata.maxParticipants === "number" &&
        Number.isFinite(contestMetadata.maxParticipants) &&
        contestMetadata.maxParticipants >= 2
          ? Math.floor(contestMetadata.maxParticipants)
          : null,
      moderationTags: Array.isArray(contestMetadata.moderationTags)
        ? [...new Set(contestMetadata.moderationTags)]
        : [],
      sharedComplicationTags: Array.isArray(contestMetadata.sharedComplicationTags)
        ? [...new Set(contestMetadata.sharedComplicationTags)]
        : [],
      windowMs,
      createdAt,
      expiresAt: createdAt + windowMs,
      participants: [],
      roles: contestMetadata.roles || {}
    };
    roomPending.set(contestMetadata.contestKey, record);
    return record;
  }

  #buildParticipant(entry, contestMetadata, issuedAt) {
    const args = entry?.command?.args ? clone(entry.command.args) : {};
    const targetActorId =
      contestMetadata.targetActorId ||
      (contestMetadata.targetParameter ? args[contestMetadata.targetParameter] : null) ||
      null;

    return {
      actorId: entry.actorId,
      verbId: entry.command?.verbId || null,
      args,
      targetActorId,
      role: contestMetadata.roles?.initiator || "challenger",
      auditRef: entry.command?.metadata?.auditRef || null,
      issuedAt
    };
  }

  #upsertParticipant(pending, participant, contestMetadata) {
    const index = pending.participants.findIndex(
      (entry) => entry.actorId === participant.actorId
    );
    if (index >= 0) {
      pending.participants[index] = participant;
    } else {
      pending.participants.push(participant);
    }
    const windowMs = pending.windowMs || contestMetadata.windowMs || 8000;
    pending.expiresAt = Math.max(
      pending.expiresAt || 0,
      participant.issuedAt + windowMs
    );
    this.#assignRoles(pending);
  }

  #assignRoles(pending) {
    if (!Array.isArray(pending.participants) || pending.participants.length === 0) {
      return;
    }
    const roles = pending.roles || {};
    const initiatorRole = roles.initiator || "challenger";
    const targetRole = roles.target || "defender";
    const supportRole = roles.support || "participant";

    const primary = pending.participants[0];
    primary.role = initiatorRole;

    for (let index = 1; index < pending.participants.length; index += 1) {
      const participant = pending.participants[index];
      if (participant.actorId === primary.targetActorId) {
        participant.role = targetRole;
      } else if (!participant.role || participant.role === initiatorRole) {
        participant.role = supportRole;
      }
    }
  }

  #assignParticipantRole(participant, roles, index) {
    if (participant.role) {
      return participant;
    }
    const initiatorRole = roles?.initiator || "challenger";
    const supportRole = roles?.support || "participant";
    return {
      ...participant,
      role: index === 0 ? initiatorRole : supportRole
    };
  }

  #serializePending(pending) {
    return {
      contestKey: pending.contestKey,
      status: "arming",
      label: pending.label,
      move: pending.move,
      type: pending.type,
      checkTemplate: pending.checkTemplate || null,
      hubId: pending.hubId || null,
      roomId: pending.roomId || null,
      expiresAt: pending.expiresAt,
      windowMs: pending.windowMs || null,
      createdAt: pending.createdAt,
      participantCapacity: pending.participantCapacity || null,
      moderationTags: Array.isArray(pending.moderationTags)
        ? [...pending.moderationTags]
        : [],
      sharedComplicationTags: Array.isArray(pending.sharedComplicationTags)
        ? [...pending.sharedComplicationTags]
        : [],
      participants: pending.participants.map((participant) => ({
        actorId: participant.actorId,
        role: participant.role,
        verbId: participant.verbId,
        targetActorId: participant.targetActorId,
        auditRef: participant.auditRef
      }))
    };
  }

  #serializeActive(activeRecord) {
    return {
      contestId: activeRecord.contestId,
      contestKey: activeRecord.contestKey,
      status: "resolving",
      label: activeRecord.label,
      move: activeRecord.move,
      type: activeRecord.type,
      checkTemplate: activeRecord.checkTemplate || null,
      hubId: activeRecord.hubId || null,
      roomId: activeRecord.roomId || null,
      startedAt: activeRecord.startedAt,
      windowMs: activeRecord.windowMs || null,
      createdAt: activeRecord.createdAt || null,
      expiresAt: activeRecord.expiresAt || null,
      participantCapacity: activeRecord.participantCapacity || null,
      moderationTags: Array.isArray(activeRecord.moderationTags)
        ? [...activeRecord.moderationTags]
        : [],
      sharedComplicationTags: Array.isArray(activeRecord.sharedComplicationTags)
        ? [...activeRecord.sharedComplicationTags]
        : [],
      participants: activeRecord.participants.map((participant) => ({
        actorId: participant.actorId,
        role: participant.role,
        verbId: participant.verbId,
        targetActorId: participant.targetActorId,
        auditRef: participant.auditRef
      }))
    };
  }

  #serializeResolved(resolvedRecord) {
    return {
      contestId: resolvedRecord.contestId,
      contestKey: resolvedRecord.contestKey,
      status: "resolved",
      label: resolvedRecord.label,
      move: resolvedRecord.move,
      type: resolvedRecord.type,
      checkTemplate: resolvedRecord.checkTemplate || null,
      hubId: resolvedRecord.hubId || null,
      roomId: resolvedRecord.roomId || null,
      startedAt: resolvedRecord.startedAt,
      resolvedAt: resolvedRecord.resolvedAt,
      windowMs: resolvedRecord.windowMs || null,
      createdAt: resolvedRecord.createdAt || null,
      expiresAt: resolvedRecord.expiresAt || null,
      outcome: resolvedRecord.outcome || null,
      sharedComplications: Array.isArray(resolvedRecord.sharedComplications)
        ? resolvedRecord.sharedComplications.map((entry) => clone(entry))
        : [],
      participantCapacity: resolvedRecord.participantCapacity || null,
      moderationTags: Array.isArray(resolvedRecord.moderationTags)
        ? [...resolvedRecord.moderationTags]
        : [],
      sharedComplicationTags: Array.isArray(resolvedRecord.sharedComplicationTags)
        ? [...resolvedRecord.sharedComplicationTags]
        : [],
      participants: resolvedRecord.participants.map((participant) => ({
        actorId: participant.actorId,
        role: participant.role,
        verbId: participant.verbId,
        targetActorId: participant.targetActorId,
        auditRef: participant.auditRef,
        result: participant.result || null
      }))
    };
  }

  #serializeExpired(record, expiredAt) {
    return {
      contestId: null,
      contestKey: record.contestKey,
      status: "expired",
      label: record.label || null,
      move: record.move || null,
      type: record.type || null,
      checkTemplate: record.checkTemplate || null,
      hubId: record.hubId || null,
      roomId: record.roomId || null,
      createdAt: record.createdAt || null,
      expiresAt: record.expiresAt || null,
      expiredAt,
      windowMs: record.windowMs || null,
      participantCapacity: record.participantCapacity || null,
      reason: "arming_timeout",
      moderationTags: Array.isArray(record.moderationTags)
        ? [...record.moderationTags]
        : [],
      sharedComplicationTags: Array.isArray(record.sharedComplicationTags)
        ? [...record.sharedComplicationTags]
        : [],
      participants: record.participants.map((participant) => ({
        actorId: participant.actorId,
        role: participant.role,
        verbId: participant.verbId,
        targetActorId: participant.targetActorId,
        auditRef: participant.auditRef || null,
        issuedAt: participant.issuedAt || null
      })),
      outcome: null,
      sharedComplications: []
    };
  }

  #gc(roomId, now) {
    const roomPending = this.pendingByRoom.get(roomId);
    if (!roomPending) {
      return;
    }
    for (const [key, record] of roomPending.entries()) {
      if (record.expiresAt <= now) {
        roomPending.delete(key);
      }
    }
    if (roomPending.size === 0) {
      this.pendingByRoom.delete(roomId);
    }
  }

  #resolveResolvedAt(record, resolution, fallbackNow) {
    const explicitResolved =
      coerceTimestamp(
        resolution?.resolvedAt ??
          resolution?.timings?.resolvedAt ??
          resolution?.meta?.resolvedAt ??
          null
      ) ?? null;
    if (explicitResolved !== null) {
      return Math.min(explicitResolved, fallbackNow);
    }

    const duration =
      coerceDuration(
        resolution?.timings?.resolutionDurationMs ??
          resolution?.durationMs ??
          resolution?.metrics?.resolutionDurationMs ??
          null
      ) ?? null;

    const startedAt =
      coerceTimestamp(
        resolution?.startedAt ??
          resolution?.timings?.startedAt ??
          resolution?.meta?.startedAt ??
          null
      ) ?? record.startedAt ?? record.createdAt ?? null;

    if (duration !== null && startedAt !== null) {
      const candidate = Math.max(startedAt, startedAt + duration);
      return Math.min(candidate, fallbackNow);
    }

    return fallbackNow;
  }

  #now() {
    return typeof this.clock.now === "function" ? this.clock.now() : Date.now();
  }
}

module.exports = {
  ContestCoordinator
};
