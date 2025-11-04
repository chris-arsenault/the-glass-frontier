"use strict";

const { clamp } = require("../utils/math");
const { validateCapabilityRefs } = require("../moderation/prohibitedCapabilitiesRegistry");

const ALLOWED_SHARDS = new Set(["character", "inventory", "relationships", "momentum"]);
const CHANGE_FEED_LIMIT = 500;

const DEFAULT_CHARACTER = {
  name: "Avery Glass",
  pronouns: "they/them",
  archetype: "Wayfarer Archivist",
  background:
    "Custodian scout cataloguing resonance anomalies across the Auric Steppe Corridor for the Prismwell Kite Guild.",
  stats: {
    ingenuity: 1,
    resolve: 1,
    finesse: 2,
    presence: 1,
    weird: 0,
    grit: 1
  },
  tags: [
    "region.auric-steppe",
    "faction.prismwell-kite-guild",
    "anchor.prism-spire.auric-step"
  ]
};

const DEFAULT_LOCATION = {
  region: "Auric Steppe Corridor",
  anchorId: "anchor.prism-spire.auric-step",
  locale: "Eclipse Relay Hub",
  atmosphere:
    "Glassfall mist refracts across suspended relay pylons as Prismwell couriers converge on relays."
};

const DEFAULT_INVENTORY = [
  {
    id: "item.glass-frontier-compass",
    name: "Glass Frontier Compass",
    tags: ["narrative-anchor", "tech.tier.resonance"]
  },
  {
    id: "item.echo-ledger-fragment",
    name: "Echo Ledger Fragment",
    tags: ["lore-hook", "faction.echo-ledger-conclave"]
  }
];

const DEFAULT_RELATIONSHIPS = [
  {
    id: "faction.cinder-scout-collective",
    name: "Cinder Scout Collective",
    status: "guarded",
    bond: 1
  },
  {
    id: "faction.prismwell-kite-guild",
    name: "Prismwell Kite Guild",
    status: "trusted",
    bond: 2
  }
];

const DEFAULT_MOMENTUM = {
  current: 0,
  floor: -2,
  ceiling: 3,
  baseline: 0,
  history: []
};

function clone(value) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value));
}

function toIsoTimestamp(value) {
  if (!value) {
    return new Date().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return new Date().toISOString();
}

function normalizeSafetyFlags(flags) {
  if (!Array.isArray(flags) || flags.length === 0) {
    return [];
  }

  const normalized = new Set();
  flags.forEach((flag) => {
    if (typeof flag === "string") {
      normalized.add(flag);
    } else if (flag && typeof flag.id === "string") {
      normalized.add(flag.id);
    }
  });
  return Array.from(normalized).sort();
}

function hasChanged(before, after) {
  return JSON.stringify(before) !== JSON.stringify(after);
}

function createShard(initialData, actor = "seed", timestamp = new Date().toISOString()) {
  return {
    data: clone(initialData),
    revision: 1,
    updatedAt: timestamp,
    updatedBy: actor
  };
}

class SessionMemoryFacade {
  constructor() {
    this.sessions = new Map();
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
        turnSequence: 0,
        characterRevision: characterShard.revision
      };

      this.sessions.set(sessionId, session);
      this._syncCompatFields(session);
    }

    return this.sessions.get(sessionId);
  }

  getSessionState(sessionId) {
    return this.ensureSession(sessionId);
  }

  appendTranscript(sessionId, entry) {
    const session = this.ensureSession(sessionId);
    const timestamp = entry.timestamp || new Date().toISOString();
    const baseContent =
      entry.content !== undefined
        ? entry.content
        : entry.text !== undefined
        ? entry.text
        : "";
    const textValue = entry.text !== undefined ? entry.text : baseContent;
    const record = {
      id: entry.id || `transcript-${session.transcript.length + 1}`,
      role: entry.role || "system",
      content: baseContent,
      text: textValue,
      metadata: entry.metadata ? { ...entry.metadata } : undefined,
      markers: Array.isArray(entry.markers) ? entry.markers.map((marker) => ({ ...marker })) : undefined,
      speaker: entry.speaker || entry.role || "system",
      playerId: entry.playerId,
      turnSequence: entry.turnSequence,
      type: entry.type || entry.metadata?.type,
      timestamp
    };

    session.transcript.push(record);

    this._recordChange(session, "transcript", {
      action: "append",
      actor: record.role || "system",
      reason: entry.reason || null,
      metadata: {
        role: record.role || "system",
        type: record.type || null,
        checkId: entry.metadata?.checkId || null,
        result: entry.metadata?.result || null
      },
      revision: session.transcript.length,
      scope: "transcript",
      before: null,
      after: record
    });

    return record;
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

  recordCheckRequest(sessionId, envelope) {
    const session = this.ensureSession(sessionId);
    const sequence = session.turnSequence + 1;
    session.turnSequence = sequence;
    session.pendingChecks.set(envelope.id, {
      ...envelope,
      requestedAt: new Date().toISOString(),
      sequence
    });
    return session;
  }

  recordCheckResolution(sessionId, envelope) {
    const session = this.ensureSession(sessionId);
    const pending = session.pendingChecks.get(envelope.id);

    if (pending) {
      session.pendingChecks.delete(envelope.id);
    }

    const momentumBefore =
      session?.shards?.momentum?.data?.current ?? session?.momentum?.current ?? 0;

    this.applyMomentum(session, envelope);
    this.applyStatAdjustments(session, envelope);

    const resolved = {
      ...pending,
      ...envelope
    };

    session.resolvedChecks.push(resolved);

    session.characterRevision += 1;

    const momentumAfter =
      session?.shards?.momentum?.data?.current ?? session?.momentum?.current ?? momentumBefore;

    const difficultyLabel =
      envelope.difficulty?.label || pending?.difficulty?.label || pending?.data?.difficulty;
    const difficultyTarget =
      envelope.difficulty?.target ||
      pending?.difficulty?.target ||
      pending?.data?.difficultyValue;
    const diceTotal =
      envelope.dice?.total !== undefined
        ? envelope.dice.total
        : Array.isArray(envelope.dice?.kept)
        ? envelope.dice.kept.reduce((sum, die) => sum + die, 0)
        : null;
    const statValue = envelope.dice?.statValue ?? pending?.data?.mechanics?.statValue ?? 0;
    const contentSegments = [
      `Check ${envelope.move || pending?.data?.move || "narrative"} resolved as ${
        envelope.tier || envelope.result
      }.`,
      difficultyLabel && difficultyTarget
        ? `Difficulty ${difficultyLabel} (${difficultyTarget}).`
        : null,
      diceTotal !== null
        ? `Dice ${diceTotal} + stat ${statValue}${
            typeof envelope.dice?.bonusDice === "number" && envelope.dice.bonusDice > 0
              ? ` (+${envelope.dice.bonusDice} bonus)`
              : ""
          }.`
        : null,
      `Momentum ${momentumBefore} → ${momentumAfter}.`
    ].filter(Boolean);

    this.appendTranscript(sessionId, {
      role: "system",
      type: "check-resolution",
      content: contentSegments.join(" "),
      metadata: {
        type: "check-resolution",
        checkId: envelope.id,
        result: envelope.result || envelope.tier,
        momentumBefore,
        momentumAfter,
        difficulty: difficultyLabel,
        difficultyTarget
      }
    });

    return session;
  }

  recordCheckVeto(sessionId, envelope) {
    const session = this.ensureSession(sessionId);
    if (session.pendingChecks.has(envelope.id)) {
      session.pendingChecks.delete(envelope.id);
    }
    const alreadyRecorded = session.vetoedChecks.some((entry) => entry.id === envelope.id);

    if (alreadyRecorded) {
      return session;
    }

    const vetoRecord = {
      ...envelope,
      recordedAt: new Date().toISOString()
    };

    session.vetoedChecks.push(vetoRecord);

    this.appendTranscript(sessionId, {
      role: "system",
      type: "check-veto",
      content: `Check ${envelope.id} vetoed (${envelope.reason || "safety policy"}).`,
      metadata: {
        type: "check-veto",
        checkId: envelope.id,
        reason: envelope.reason || null,
        safetyFlags: envelope.safetyFlags || []
      }
    });
    return session;
  }

  getMomentumState(sessionId) {
    const session = this.ensureSession(sessionId);
    return clone(session.momentum);
  }

  applyMomentum(session, envelope) {
    if (!session || !session.shards?.momentum) {
      return;
    }

    const timestamp = new Date().toISOString();
    const meta = {
      actor: envelope.actor || "checkRunner",
      reason: envelope.momentum?.reason || envelope.tier || envelope.result || "momentum-adjustment",
      action: "momentum-adjustment",
      capabilityRefs: envelope.capabilityRefs || [],
      safetyFlags: envelope.safetyFlags || [],
      metadata: { checkId: envelope.id },
      timestamp
    };

    const result = this._mutateShard(
      session,
      "momentum",
      (momentum) => {
        const before = momentum.current;
        let after = before;
        let delta = typeof envelope.momentumDelta === "number" ? envelope.momentumDelta : 0;
        let reason = meta.reason;

        if (envelope.momentum && typeof envelope.momentum.after === "number") {
          after = envelope.momentum.after;
          delta = envelope.momentum.delta ?? after - before;
          reason = envelope.momentum.reason || reason;
        } else if (typeof envelope.momentumReset === "number") {
          after = envelope.momentumReset;
          delta = after - before;
        } else if (typeof delta === "number") {
          after = before + delta;
        }

        const clamped = clamp(after, momentum.floor, momentum.ceiling);

        if (clamped === before && delta === 0) {
          return { changed: false };
        }

        momentum.current = clamped;
        momentum.history = Array.isArray(momentum.history) ? momentum.history : [];
        momentum.history.push({
          before,
          after: momentum.current,
          delta: momentum.current - before,
          reason,
          at: timestamp,
          checkId: envelope.id
        });

        return { changed: true };
      },
      meta
    );

    if (result.changed) {
      session.characterRevision += 1;
    }
  }

  applyStatAdjustments(session, envelope) {
    if (!Array.isArray(envelope.statAdjustments) || envelope.statAdjustments.length === 0) {
      return;
    }

    const validAdjustments = envelope.statAdjustments.filter(
      (adjustment) => typeof adjustment?.stat === "string" && typeof adjustment?.delta === "number"
    );

    if (validAdjustments.length === 0) {
      return;
    }

    const timestamp = new Date().toISOString();
    const meta = {
      actor: envelope.actor || "checkRunner",
      reason: "stat-adjustment",
      action: "stat-adjustment",
      capabilityRefs: envelope.capabilityRefs || [],
      safetyFlags: envelope.safetyFlags || [],
      metadata: { checkId: envelope.id },
      timestamp
    };

    const result = this._mutateShard(
      session,
      "character",
      (character) => {
        const stats = character.stats || {};
        let applied = 0;

        validAdjustments.forEach((adjustment) => {
          const current = stats[adjustment.stat] || 0;
          stats[adjustment.stat] = current + adjustment.delta;
          applied += 1;
        });

        character.stats = stats;

        if (applied === 0) {
          return { changed: false };
        }

        return { changed: true };
      },
      meta
    );

    if (result.changed) {
      validAdjustments.forEach((adjustment) => {
        session.statAdjustments.push({
          stat: adjustment.stat,
          delta: adjustment.delta,
          reason: adjustment.reason,
          appliedAt: timestamp,
          checkId: envelope.id
        });
      });
      session.characterRevision += 1;
    }
  }

  recordPlayerControl(sessionId, control) {
    const session = this.ensureSession(sessionId);
    const intent = {
      id: control?.id || `control-${Date.now()}`,
      sessionId,
      type: control?.type || "wrap",
      turns: typeof control?.turns === "number" ? control.turns : null,
      metadata: control?.metadata || {},
      submittedAt: new Date().toISOString()
    };

    session.controls.push(intent);
    return intent;
  }

  listPendingChecks(sessionId) {
    const session = this.ensureSession(sessionId);
    return Array.from(session.pendingChecks.values()).map((check) => ({
      ...check,
      data: clone(check.data)
    }));
  }

  listRecentResolvedChecks(sessionId, limit = 5) {
    const session = this.ensureSession(sessionId);
    return session.resolvedChecks.slice(-Math.abs(limit)).map((check) => ({
      ...check,
      data: clone(check.data)
    }));
  }

  getOverlaySnapshot(sessionId) {
    const session = this.ensureSession(sessionId);
    const now = new Date().toISOString();

    return {
      revision: session.characterRevision,
      character: clone(session.shards.character.data),
      inventory: clone(session.shards.inventory.data),
      relationships: clone(session.shards.relationships.data),
      momentum: clone({
        ...session.shards.momentum.data,
        history: session.shards.momentum.data.history.slice(-20)
      }),
      capabilityReferences: session.capabilityReferences.map((ref) => ({ ...ref })),
      pendingOfflineReconcile: session.pendingOfflineReconcile,
      lastChangeCursor: session.changeCursor,
      lastAcknowledgedCursor: session.lastAckCursor,
      lastUpdatedAt: session.shards.character.updatedAt,
      lastSyncedAt: now
    };
  }

  getShard(sessionId, shardName) {
    const session = this.ensureSession(sessionId);
    const shard = this._getShard(session, shardName);
    return {
      sessionId,
      shard: shardName,
      revision: shard.revision,
      updatedAt: shard.updatedAt,
      updatedBy: shard.updatedBy,
      data: clone(shard.data)
    };
  }

  getAllShards(sessionId) {
    const session = this.ensureSession(sessionId);
    const result = {};
    ALLOWED_SHARDS.forEach((shardName) => {
      const shard = session.shards[shardName];
      result[shardName] = {
        revision: shard.revision,
        updatedAt: shard.updatedAt,
        updatedBy: shard.updatedBy,
        data: clone(shard.data)
      };
    });
    return result;
  }

  replaceShard(sessionId, shardName, payload, meta = {}) {
    const session = this.ensureSession(sessionId);
    const shard = this._getShard(session, shardName);

    const scope = meta.scope || payload.scope || "ephemeral";
    if (scope !== "ephemeral") {
      const error = new Error("canonical_write_not_allowed");
      error.code = "canonical_write_not_allowed";
      throw error;
    }

    const expectedRevision =
      meta.expectedRevision ??
      meta.ifMatch ??
      payload.expectedRevision ??
      payload.revision ??
      null;

    if (typeof expectedRevision === "number" && expectedRevision !== shard.revision) {
      const error = new Error("revision_mismatch");
      error.code = "revision_mismatch";
      error.currentRevision = shard.revision;
      error.expectedRevision = expectedRevision;
      throw error;
    }

    const change = this._mutateShard(
      session,
      shardName,
      () => ({
        nextValue: payload.data !== undefined ? payload.data : payload
      }),
      {
        actor: meta.actor || payload.actor || "system",
        reason: meta.reason || payload.reason || null,
        action: "replace",
        capabilityRefs: meta.capabilityRefs || payload.capabilityRefs || [],
        safetyFlags: meta.safetyFlags || payload.safetyFlags || [],
        metadata: meta.metadata || payload.metadata || {},
        timestamp: meta.timestamp || payload.timestamp,
        scope
      }
    );

    return {
      sessionId,
      shard: shardName,
      changed: change.changed,
      revision: session.shards[shardName].revision,
      updatedAt: session.shards[shardName].updatedAt,
      updatedBy: session.shards[shardName].updatedBy
    };
  }

  listChanges(sessionId, sinceCursor = 0, limit = 50) {
    const session = this.ensureSession(sessionId);
    const since = Number.isFinite(Number(sinceCursor)) ? Number(sinceCursor) : 0;
    const maxEntries = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const entries = session.changeFeed
      .filter((entry) => entry.cursor > since)
      .slice(0, maxEntries)
      .map((entry) => clone(entry));
    const lastCursor = entries.length > 0 ? entries[entries.length - 1].cursor : since;
    const hasMore = session.changeFeed.some((entry) => entry.cursor > lastCursor);

    return {
      sessionId,
      since,
      entries,
      nextCursor: lastCursor,
      hasMore,
      latestCursor: session.changeCursor
    };
  }

  acknowledgeChanges(sessionId, cursor) {
    const session = this.ensureSession(sessionId);
    const ackCursor = Math.max(session.lastAckCursor, Number(cursor) || 0);
    session.lastAckCursor = ackCursor;
    session.pendingOfflineReconcile = session.changeCursor > session.lastAckCursor;
    return {
      sessionId,
      acknowledgedThrough: session.lastAckCursor,
      pending: session.pendingOfflineReconcile
    };
  }

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
      error: run.error || null
    };

    session.offlineWorkflowHistory.push(entry);
    if (session.offlineWorkflowHistory.length > 50) {
      session.offlineWorkflowHistory.shift();
    }

    session.lastOfflineWorkflowRun = entry;
    return entry;
  }

  markOfflineReconciled(sessionId, options = {}) {
    const session = this.ensureSession(sessionId);
    const reconciledAt = toIsoTimestamp(options.reconciledAt);
    session.lastAckCursor = session.changeCursor;
    session.pendingOfflineReconcile = false;
    session.offlineReconciledAt = reconciledAt;
    session.offlineReconcileAuditRef = options.auditRef || session.lastClosureAuditRef || null;

    if (session.lastOfflineWorkflowRun) {
      session.lastOfflineWorkflowRun.status = options.status || session.lastOfflineWorkflowRun.status || "completed";
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

  getCapabilityReferences(sessionId) {
    const session = this.ensureSession(sessionId);
    return session.capabilityReferences.map((ref) => ({ ...ref }));
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
    if (!ALLOWED_SHARDS.has(shardName)) {
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

module.exports = {
  SessionMemoryFacade
};
