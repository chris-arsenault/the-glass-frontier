"use strict";

const DEFAULT_CHARACTER = {
  name: "Avery Glass",
  pronouns: "they/them",
  archetype: "Wayfarer",
  background: "Former archivist tracking lost frontier tech."
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
        character: { ...DEFAULT_CHARACTER },
        location: { ...DEFAULT_LOCATION },
        inventory: [
          { id: "compass", name: "Glass Frontier Compass", tags: ["narrative-anchor"] }
        ],
        relationships: [
          { id: "cinder-scouts", name: "Cinder Scout Collective", status: "guarded" }
        ],
        transcript: [],
        pendingChecks: new Map(),
        resolvedChecks: []
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
    session.pendingChecks.set(envelope.id, {
      ...envelope,
      requestedAt: new Date().toISOString()
    });
    return session;
  }

  recordCheckResolution(sessionId, envelope) {
    const session = this.ensureSession(sessionId);
    const pending = session.pendingChecks.get(envelope.id);

    if (pending) {
      session.pendingChecks.delete(envelope.id);
    }

    session.resolvedChecks.push({
      ...pending,
      ...envelope
    });

    return session;
  }
}

module.exports = {
  SessionMemoryFacade
};
