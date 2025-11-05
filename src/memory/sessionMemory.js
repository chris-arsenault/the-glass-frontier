"use strict";

const { validateCapabilityRefs } = require("../moderation/prohibitedCapabilitiesRegistry");
const {
  ALLOWED_SHARDS,
  CHANGE_FEED_LIMIT,
  DEFAULT_CHARACTER,
  DEFAULT_LOCATION,
  DEFAULT_INVENTORY,
  DEFAULT_RELATIONSHIPS,
  DEFAULT_MOMENTUM
} = require("./sessionDefaults");
const {
  clone,
  normalizeSafetyFlags,
  hasChanged,
  createShard
} = require("./sessionMemoryUtils");
const {
  adminMemoryMixin,
  createInitialModerationState
} = require("./sessionAdminMemory");
const { narrationMemoryMixin } = require("./sessionNarrationMemory");

class SessionMemoryFacade {
  constructor({ moderationQueueStore = null, clock = () => new Date() } = {}) {
    this.sessions = new Map();
    this.moderationQueueStore = moderationQueueStore;
    this.clock = clock;
    this.hydratingModerationQueues = false;
    this.moderationQueueListeners = new Set();
    this.ALLOWED_SHARDS = new Set(ALLOWED_SHARDS);
  }

  ensureSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      const timestamp = new Date().toISOString();
      const characterShard = createShard(DEFAULT_CHARACTER, "seed", timestamp);
      const inventoryShard = createShard(DEFAULT_INVENTORY, "seed", timestamp);
      const relationshipsShard = createShard(DEFAULT_RELATIONSHIPS, "seed", timestamp);
      const momentumShard = createShard(DEFAULT_MOMENTUM, "seed", timestamp);

      const session = {
        sessionId,
        createdAt: timestamp,
        updatedAt: timestamp,
        player: {
          id: `player-${sessionId}`,
          name: "Frontier Runner"
        },
        location: { ...DEFAULT_LOCATION },
        shards: {
          character: characterShard,
          inventory: inventoryShard,
          relationships: relationshipsShard,
          momentum: momentumShard
        },
        controls: [],
        transcript: [],
        pendingChecks: new Map(),
        resolvedChecks: [],
        vetoedChecks: [],
        statAdjustments: [],
        changeFeed: [],
        changeCursor: 0,
        lastAckCursor: 0,
        capabilityReferences: [],
        pendingOfflineReconcile: false,
        offlineWorkflowHistory: [],
        lastOfflineWorkflowRun: null,
        offlineReconciledAt: null,
        offlineReconcileAuditRef: null,
        lastClosureAuditRef: null,
        turnSequence: 0,
        characterRevision: characterShard.revision,
        moderation: createInitialModerationState()
      };

      this.sessions.set(sessionId, session);
      this._syncCompatFields(session);
    }

    return this.sessions.get(sessionId);
  }

  getSessionState(sessionId) {
    return this.ensureSession(sessionId);
  }

  markSessionClosed(sessionId, options = {}) {
    const session = this.ensureSession(sessionId);
    const closedAt =
      options.closedAt instanceof Date
        ? options.closedAt.toISOString()
        : options.closedAt || new Date().toISOString();
    session.pendingOfflineReconcile = true;
    session.closedAt = closedAt;
    session.updatedAt = closedAt;
    if (options.closedBy) {
      session.closedBy = options.closedBy;
    }
    if (options.reason) {
      session.closureReason = options.reason;
    }
    if (options.auditRef) {
      session.lastClosureAuditRef = options.auditRef;
    }
    return {
      sessionId,
      closedAt: session.closedAt,
      pendingOfflineReconcile: session.pendingOfflineReconcile
    };
  }

  _getShard(session, shardName) {
    this._validateShardName(shardName);
    const shard = session.shards[shardName];
    if (!shard) {
      const error = new Error("memory_shard_unavailable");
      error.code = "memory_shard_unavailable";
      error.shard = shardName;
      throw error;
    }
    return shard;
  }

  _validateShardName(shardName) {
    if (!this.ALLOWED_SHARDS.has(shardName)) {
      const error = new Error("unknown_memory_shard");
      error.code = "unknown_memory_shard";
      error.shard = shardName;
      throw error;
    }
  }

  _syncCompatFields(session, shardName) {
    if (!shardName || shardName === "character") {
      session.character = session.shards.character.data;
      session.characterRevision = Math.max(
        session.characterRevision,
        session.shards.character.revision
      );
    }

    if (!shardName || shardName === "inventory") {
      session.inventory = session.shards.inventory.data;
    }

    if (!shardName || shardName === "relationships") {
      session.relationships = session.shards.relationships.data;
    }

    if (!shardName || shardName === "momentum") {
      session.momentum = session.shards.momentum.data;
    }
  }

  _mergeCapabilityRefs(session, refs) {
    if (!Array.isArray(refs) || refs.length === 0) {
      return;
    }

    const merged = new Map(session.capabilityReferences.map((ref) => [ref.capabilityId, ref]));
    refs.forEach((ref) => {
      merged.set(ref.capabilityId, { ...ref });
    });
    session.capabilityReferences = Array.from(merged.values());
  }

  _recordChange(session, shardName, change) {
    const entry = {
      cursor: session.changeCursor + 1,
      sessionId: session.sessionId,
      shard: shardName,
      action: change.action || "update",
      actor: change.actor || "system",
      reason: change.reason || null,
      capabilityRefs: Array.isArray(change.capabilityRefs)
        ? change.capabilityRefs.map((ref) => ({ ...ref }))
        : [],
      safetyFlags: Array.isArray(change.safetyFlags) ? [...change.safetyFlags] : [],
      revision: change.revision ?? this._getShard(session, shardName).revision,
      scope: change.scope || "ephemeral",
      timestamp: change.timestamp || new Date().toISOString(),
      metadata: change.metadata ? { ...change.metadata } : {},
      before: clone(change.before),
      after: clone(change.after)
    };

    session.changeCursor = entry.cursor;
    session.changeFeed.push(entry);
    if (session.changeFeed.length > CHANGE_FEED_LIMIT) {
      session.changeFeed.splice(0, session.changeFeed.length - CHANGE_FEED_LIMIT);
    }
    session.pendingOfflineReconcile = session.changeCursor > session.lastAckCursor;
  }

  _mutateShard(session, shardName, mutator, meta = {}) {
    const sessionRecord = session;
    const shard = this._getShard(sessionRecord, shardName);
    const before = clone(shard.data);
    const workingCopy = clone(shard.data);

    const mutationResult = mutator(workingCopy) || {};
    const nextValue = Object.prototype.hasOwnProperty.call(mutationResult, "nextValue")
      ? mutationResult.nextValue
      : workingCopy;
    const after = clone(nextValue);

    const changed =
      typeof mutationResult.changed === "boolean" ? mutationResult.changed : hasChanged(before, after);

    const normalizedRefs = validateCapabilityRefs(meta.capabilityRefs || []);
    const safetyFlags = normalizeSafetyFlags(meta.safetyFlags || []);
    const scope = meta.scope || "ephemeral";

    if (!changed) {
      if (normalizedRefs.length > 0) {
        this._mergeCapabilityRefs(sessionRecord, normalizedRefs);
      }
      return { changed: false, revision: shard.revision };
    }

    shard.data = after;
    const timestamp = meta.timestamp || new Date().toISOString();
    const actor = meta.actor || "system";
    shard.revision += 1;
    shard.updatedAt = timestamp;
    shard.updatedBy = actor;

    this._recordChange(sessionRecord, shardName, {
      actor,
      reason: meta.reason || null,
      action: meta.action || "update",
      capabilityRefs: normalizedRefs,
      safetyFlags,
      revision: shard.revision,
      timestamp,
      before,
      after,
      metadata: meta.metadata || {},
      scope
    });

    this._mergeCapabilityRefs(sessionRecord, normalizedRefs);
    this._syncCompatFields(sessionRecord, shardName);

    return { changed: true, revision: shard.revision };
  }
}

Object.assign(SessionMemoryFacade.prototype, adminMemoryMixin);
Object.assign(SessionMemoryFacade.prototype, narrationMemoryMixin);

module.exports = {
  SessionMemoryFacade
};
