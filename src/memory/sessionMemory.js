"use strict";

const { clamp } = require("../utils/math");

const DEFAULT_CHARACTER = {
  name: "Avery Glass",
  pronouns: "they/them",
  archetype: "Wayfarer",
  background: "Former archivist tracking lost frontier tech.",
  stats: {
    ingenuity: 1,
    resolve: 1,
    finesse: 2,
    presence: 1,
    weird: 0,
    grit: 1
  }
};

const DEFAULT_LOCATION = {
  region: "Shattered Aurora Expanse",
  locale: "Eclipse Relay Hub",
  atmosphere: "Iridescent dust storms mingle with flickering relay pylons."
};

class SessionMemoryFacade {
  constructor() {
    this.sessions = new Map();
  }

  ensureSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        sessionId,
        createdAt: new Date().toISOString(),
        player: {
          id: `player-${sessionId}`,
          name: "Frontier Runner"
        },
        character: {
          ...DEFAULT_CHARACTER,
          stats: { ...DEFAULT_CHARACTER.stats }
        },
        location: { ...DEFAULT_LOCATION },
        inventory: [
          { id: "compass", name: "Glass Frontier Compass", tags: ["narrative-anchor"] }
        ],
        relationships: [
          { id: "cinder-scouts", name: "Cinder Scout Collective", status: "guarded" }
        ],
        controls: [],
        transcript: [],
        pendingChecks: new Map(),
        resolvedChecks: [],
        vetoedChecks: [],
        statAdjustments: [],
        momentum: {
          current: 0,
          floor: -2,
          ceiling: 3,
          baseline: 0,
          history: []
        },
        turnSequence: 0,
        characterRevision: 1
      });
    }

    return this.sessions.get(sessionId);
  }

  getSessionState(sessionId) {
    return this.ensureSession(sessionId);
  }

  appendTranscript(sessionId, entry) {
    const session = this.ensureSession(sessionId);
    session.transcript.push({
      ...entry,
      timestamp: entry.timestamp || new Date().toISOString()
    });
    return session;
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

    this.applyMomentum(session, envelope);
    this.applyStatAdjustments(session, envelope);

    session.resolvedChecks.push({
      ...pending,
      ...envelope
    });

    session.characterRevision += 1;

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

    session.vetoedChecks.push({
      ...envelope,
      recordedAt: new Date().toISOString()
    });
    return session;
  }

  getMomentumState(sessionId) {
    const session = this.ensureSession(sessionId);
    return { ...session.momentum };
  }

  applyMomentum(session, envelope) {
    if (!session.momentum) {
      return;
    }

    const momentumMeta = envelope.momentum;
    const before = session.momentum.current;

    let after = before;
    let delta = envelope.momentumDelta || 0;
    let reason = momentumMeta?.reason || envelope.tier || envelope.result;

    if (momentumMeta && typeof momentumMeta.after === "number") {
      after = momentumMeta.after;
      delta = momentumMeta.delta ?? after - before;
      reason = momentumMeta.reason || reason;
    } else if (typeof envelope.momentumReset === "number") {
      after = envelope.momentumReset;
      delta = after - before;
    } else if (typeof delta === "number") {
      const target = before + delta;
      after = clamp(target, session.momentum.floor, session.momentum.ceiling);
    } else {
      return;
    }

    session.momentum.current = clamp(after, session.momentum.floor, session.momentum.ceiling);
    session.momentum.history.push({
      before,
      after: session.momentum.current,
      delta: session.momentum.current - before,
      reason,
      at: new Date().toISOString(),
      checkId: envelope.id
    });

    session.characterRevision += 1;
  }

  applyStatAdjustments(session, envelope) {
    if (!Array.isArray(envelope.statAdjustments) || envelope.statAdjustments.length === 0) {
      return;
    }

    const stats = session.character.stats || {};
    envelope.statAdjustments.forEach((adjustment) => {
      const { stat, delta, reason } = adjustment;
      if (typeof stat !== "string" || typeof delta !== "number") {
        return;
      }

      const current = stats[stat] || 0;
      stats[stat] = current + delta;
      session.statAdjustments.push({
        stat,
        delta,
        reason,
        appliedAt: new Date().toISOString(),
        checkId: envelope.id
      });
    });

    session.characterRevision += 1;
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
      data: { ...(check.data || {}) }
    }));
  }

  listRecentResolvedChecks(sessionId, limit = 5) {
    const session = this.ensureSession(sessionId);
    return session.resolvedChecks.slice(-Math.abs(limit)).map((check) => ({
      ...check,
      data: { ...(check.data || {}) }
    }));
  }

  getOverlaySnapshot(sessionId) {
    const session = this.ensureSession(sessionId);

    const cloneStats = (stats = {}) =>
      Object.entries(stats).reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {});

    return {
      revision: session.characterRevision,
      character: {
        ...session.character,
        stats: cloneStats(session.character.stats)
      },
      inventory: session.inventory.map((item) => ({ ...item })),
      momentum: {
        ...session.momentum,
        history: session.momentum.history.slice(-20).map((entry) => ({ ...entry }))
      },
      pendingOfflineReconcile: false,
      lastSyncedAt: new Date().toISOString()
    };
  }
}

module.exports = {
  SessionMemoryFacade
};
