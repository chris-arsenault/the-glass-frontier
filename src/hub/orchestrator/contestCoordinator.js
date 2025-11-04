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

class ContestCoordinator {
  constructor({ clock = Date } = {}) {
    this.clock = clock;
    this.pendingByRoom = new Map();
    this.activeById = new Map();
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
      moderationTags: pending.moderationTags,
      sharedComplicationTags: pending.sharedComplicationTags,
      participants,
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
    const resolvedAt = this.#now();
    const resolvedRecord = {
      ...record,
      status: "resolved",
      resolvedAt,
      outcome: resolution.outcome || null,
      sharedComplications: Array.isArray(resolution.sharedComplications)
        ? resolution.sharedComplications.map((entry) => ({ ...entry }))
        : [],
      participants: record.participants.map((participant) => {
        const participantResolution = Array.isArray(resolution.participants)
          ? resolution.participants.find((entry) => entry.actorId === participant.actorId)
          : null;
        return {
          ...participant,
          result: participantResolution ? { ...participantResolution } : null
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

    const record = {
      contestKey: contestMetadata.contestKey,
      hubId: contestMetadata.hubId,
      roomId,
      type: contestMetadata.type,
      move: contestMetadata.move,
      label: contestMetadata.label,
      checkTemplate: contestMetadata.checkTemplate,
      moderationTags: Array.isArray(contestMetadata.moderationTags)
        ? [...new Set(contestMetadata.moderationTags)]
        : [],
      sharedComplicationTags: Array.isArray(contestMetadata.sharedComplicationTags)
        ? [...new Set(contestMetadata.sharedComplicationTags)]
        : [],
      windowMs:
        typeof contestMetadata.windowMs === "number" && contestMetadata.windowMs > 0
          ? contestMetadata.windowMs
          : 8000,
      createdAt: this.#now(),
      expiresAt: this.#now() + (contestMetadata.windowMs || 8000),
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
    pending.expiresAt = Math.max(
      pending.expiresAt || 0,
      participant.issuedAt + (contestMetadata.windowMs || 8000)
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
      expiresAt: pending.expiresAt,
      createdAt: pending.createdAt,
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
      startedAt: activeRecord.startedAt,
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
      startedAt: resolvedRecord.startedAt,
      resolvedAt: resolvedRecord.resolvedAt,
      outcome: resolvedRecord.outcome || null,
      sharedComplications: Array.isArray(resolvedRecord.sharedComplications)
        ? resolvedRecord.sharedComplications.map((entry) => ({ ...entry }))
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

  #now() {
    return typeof this.clock.now === "function" ? this.clock.now() : Date.now();
  }
}

module.exports = {
  ContestCoordinator
};
