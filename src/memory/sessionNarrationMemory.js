"use strict";

const { clamp } = require("../utils/math");
const { clone } = require("./sessionMemoryUtils");

function normalizeInventoryItem(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const id = typeof raw.id === "string" && raw.id.trim().length > 0 ? raw.id.trim() : null;
  if (!id) {
    return null;
  }

  const name =
    typeof raw.name === "string" && raw.name.trim().length > 0 ? raw.name.trim() : undefined;
  const tags = Array.isArray(raw.tags)
    ? raw.tags.map((tag) => String(tag).trim()).filter(Boolean)
    : undefined;
  const quantity =
    typeof raw.quantity === "number" && Number.isFinite(raw.quantity) ? raw.quantity : undefined;

  const item = { ...raw, id };

  if (name !== undefined) {
    item.name = name;
  }
  if (tags !== undefined) {
    item.tags = Array.from(new Set(tags));
  }
  if (quantity !== undefined) {
    item.quantity = quantity;
  }

  return item;
}

function applyInventoryOperations(inventory, delta, summary) {
  if (!Array.isArray(inventory)) {
    return false;
  }

  const byId = new Map(inventory.map((entry) => [entry.id, entry]));
  let changed = false;

  const additions = Array.isArray(delta?.add) ? delta.add : [];
  additions.forEach((rawItem) => {
    const item = normalizeInventoryItem(rawItem);
    if (!item) {
      return;
    }

    const existing = byId.get(item.id);
    if (existing) {
      let localChanged = false;

      if (typeof item.quantity === "number") {
        const currentQty = typeof existing.quantity === "number" ? existing.quantity : 0;
        const nextQty = currentQty + item.quantity;
        if (nextQty !== currentQty) {
          existing.quantity = nextQty;
          localChanged = true;
        }
      }

      if (Array.isArray(item.tags) && item.tags.length > 0) {
        const existingTags = Array.isArray(existing.tags) ? existing.tags : [];
        const nextTags = Array.from(new Set([...existingTags, ...item.tags]));
        if (nextTags.length !== existingTags.length) {
          existing.tags = nextTags;
          localChanged = true;
        }
      }

      if (localChanged) {
        summary.updated.push({ id: item.id, mode: "stacked" });
        changed = true;
      }
      return;
    }

    inventory.push(item);
    byId.set(item.id, item);
    summary.added.push(item.id);
    changed = true;
  });

  const removals = Array.isArray(delta?.remove) ? delta.remove : [];
  removals.forEach((rawItem) => {
    const targetId =
      typeof rawItem === "string"
        ? rawItem
        : typeof rawItem?.id === "string"
        ? rawItem.id
        : null;
    if (!targetId) {
      return;
    }

    const existing = byId.get(targetId);
    if (!existing) {
      return;
    }

    if (typeof rawItem?.quantity === "number" && typeof existing.quantity === "number") {
      const remaining = existing.quantity - rawItem.quantity;
      if (remaining > 0) {
        existing.quantity = remaining;
        summary.updated.push({ id: targetId, mode: "consumed", quantity: remaining });
        changed = true;
        return;
      }
    }

    const index = inventory.findIndex((entry) => entry.id === targetId);
    if (index >= 0) {
      inventory.splice(index, 1);
      byId.delete(targetId);
      summary.removed.push(targetId);
      changed = true;
    }
  });

  const updates = Array.isArray(delta?.update) ? delta.update : [];
  updates.forEach((rawUpdate) => {
    if (!rawUpdate || typeof rawUpdate !== "object") {
      return;
    }

    const targetId = typeof rawUpdate.id === "string" ? rawUpdate.id : null;
    if (!targetId) {
      return;
    }

    const existing = byId.get(targetId);
    if (!existing) {
      return;
    }

    const patch =
      rawUpdate.patch && typeof rawUpdate.patch === "object" ? rawUpdate.patch : rawUpdate;
    let localChanged = false;

    if (typeof patch.quantity === "number" && Number.isFinite(patch.quantity)) {
      if (existing.quantity !== patch.quantity) {
        existing.quantity = patch.quantity;
        localChanged = true;
      }
    }

    if (typeof patch.name === "string" && patch.name.trim().length > 0) {
      const trimmed = patch.name.trim();
      if (existing.name !== trimmed) {
        existing.name = trimmed;
        localChanged = true;
      }
    }

    if (Array.isArray(patch.tags)) {
      const nextTags = Array.from(new Set(patch.tags.map((tag) => String(tag).trim()).filter(Boolean)));
      const currentTags = Array.isArray(existing.tags) ? existing.tags : [];
      const sameLength = nextTags.length === currentTags.length;
      const sameValues =
        sameLength && nextTags.every((tag, index) => tag === currentTags[index]);
      if (!sameValues) {
        existing.tags = nextTags;
        localChanged = true;
      }
    }

    if (typeof patch.description === "string") {
      const trimmed = patch.description.trim();
      if (existing.description !== trimmed) {
        existing.description = trimmed;
        localChanged = true;
      }
    }

    if (localChanged) {
      summary.updated.push({ id: targetId, mode: "patched" });
      changed = true;
    }
  });

  return changed;
}

const narrationMemoryMixin = {
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
  },

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
  },

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
    this.applyInventoryMutations(session, envelope, sessionId);

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
  },

  applyInventoryMutations(session, envelope, sessionId) {
    if (!session || !envelope || !envelope.inventoryDelta) {
      return;
    }

    const summary = {
      added: [],
      removed: [],
      updated: []
    };

    const timestamp = envelope.timestamp || new Date().toISOString();
    const actor = envelope.actor || (envelope.source === "gm-response" ? "gm" : "player");
    const reason =
      envelope.inventoryDelta?.reason ||
      envelope.reason ||
      (envelope.source === "gm-response" ? "gm-inventory-directive" : "player-inventory-request");

    const result = this._mutateShard(
      session,
      "inventory",
      (inventory) => {
        const changed = applyInventoryOperations(inventory, envelope.inventoryDelta, summary);
        return { changed };
      },
      {
        actor,
        reason,
        action: envelope.inventoryDelta?.action || "inventory-update",
        capabilityRefs: envelope.capabilityRefs || [],
        safetyFlags: envelope.safetyFlags || [],
        metadata: {
          source: envelope.source || "unknown",
          requestId: envelope.requestId || null,
          gmResponseId: envelope.gmResponseId || null,
          applied: summary
        },
        timestamp
      }
    );

    if (!result.changed) {
      return;
    }

    session.characterRevision += 1;

    const summarySegments = [];
    if (summary.added.length > 0) {
      summarySegments.push(`Added ${summary.added.length} item(s): ${summary.added.join(", ")}.`);
    }
    if (summary.removed.length > 0) {
      summarySegments.push(`Removed ${summary.removed.length} item(s): ${summary.removed.join(", ")}.`);
    }
    if (summary.updated.length > 0) {
      summarySegments.push(
        `Updated ${summary.updated.length} item(s): ${summary.updated
          .map((entry) => entry.id)
          .join(", ")}.`
      );
    }

    const narrationPayload = envelope.inventoryDelta?.narration;
    let narrationText = null;
    let narrationMetadata = {};

    if (typeof narrationPayload === "string") {
      narrationText = narrationPayload;
    } else if (narrationPayload && typeof narrationPayload === "object") {
      narrationText =
        typeof narrationPayload.content === "string"
          ? narrationPayload.content
          : typeof narrationPayload.text === "string"
          ? narrationPayload.text
          : null;
      if (narrationPayload.metadata && typeof narrationPayload.metadata === "object") {
        narrationMetadata = { ...narrationPayload.metadata };
      }
    } else if (summarySegments.length > 0) {
      narrationText = summarySegments.join(" ");
    }

    if (narrationText) {
      this.appendTranscript(sessionId, {
        role: actor,
        type: "inventory-update",
        content: narrationText,
        metadata: {
          type: "inventory-update",
          requestId: envelope.requestId || null,
          gmResponseId: envelope.gmResponseId || null,
          applied: summary,
          ...narrationMetadata
        },
        timestamp
      });
    }
  },

  applyPlayerInventoryIntent(sessionId, intentEnvelope) {
    const session = this.ensureSession(sessionId);
    const envelope = {
      ...intentEnvelope,
      source: intentEnvelope?.source || "player-intent",
      actor: intentEnvelope?.actor || intentEnvelope?.playerId || "player"
    };

    this.applyInventoryMutations(session, envelope, sessionId);

    return this.getShard(sessionId, "inventory");
  },

  applyGmInventoryDirective(sessionId, directiveEnvelope) {
    const session = this.ensureSession(sessionId);
    const envelope = {
      ...directiveEnvelope,
      source: directiveEnvelope?.source || "gm-response",
      actor: directiveEnvelope?.actor || "gm"
    };

    this.applyInventoryMutations(session, envelope, sessionId);

    return this.getShard(sessionId, "inventory");
  },

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
  },

  getMomentumState(sessionId) {
    const session = this.ensureSession(sessionId);
    return clone(session.momentum);
  },

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
  },

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
  },

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
  },

  listPendingChecks(sessionId) {
    const session = this.ensureSession(sessionId);
    return Array.from(session.pendingChecks.values()).map((check) => ({
      ...check,
      data: clone(check.data)
    }));
  },

  listRecentResolvedChecks(sessionId, limit = 5) {
    const session = this.ensureSession(sessionId);
    return session.resolvedChecks.slice(-Math.abs(limit)).map((check) => ({
      ...check,
      data: clone(check.data)
    }));
  },

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
  },

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
  },

  getAllShards(sessionId) {
    const session = this.ensureSession(sessionId);
    const result = {};
    this.ALLOWED_SHARDS.forEach((shardName) => {
      const shard = session.shards[shardName];
      result[shardName] = {
        revision: shard.revision,
        updatedAt: shard.updatedAt,
        updatedBy: shard.updatedBy,
        data: clone(shard.data)
      };
    });
    return result;
  },

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
  },

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
  },

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
  },

  getCapabilityReferences(sessionId) {
    const session = this.ensureSession(sessionId);
    return session.capabilityReferences.map((ref) => ({ ...ref }));
  }
};

module.exports = {
  narrationMemoryMixin
};
