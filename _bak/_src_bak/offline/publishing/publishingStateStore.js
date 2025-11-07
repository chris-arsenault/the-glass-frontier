"use strict";

import { v4 as uuid  } from "uuid";

function deepClone(input) {
  return JSON.parse(JSON.stringify(input));
}

class PublishingStateStore {
  constructor(options = {}) {
    this.clock = options.clock || (() => new Date());
    this.sessions = new Map();
  }

  createSession(sessionId, bootstrapState) {
    if (!sessionId) {
      throw new Error("publishing_state_requires_session_id");
    }

    if (this.sessions.has(sessionId)) {
      throw new Error("publishing_state_session_exists");
    }

    const createdAt = this.clock().toISOString();
    const state = deepClone(bootstrapState || {});
    state.sessionId = sessionId;
    state.stateId = uuid();
    state.createdAt = createdAt;
    state.updatedAt = createdAt;
    state.history = [];

    this.sessions.set(sessionId, state);
    return deepClone(state);
  }

  getSession(sessionId) {
    const state = this.sessions.get(sessionId);
    return state ? deepClone(state) : null;
  }

  updateSession(sessionId, mutator) {
    const current = this.sessions.get(sessionId);
    if (!current) {
      throw new Error("publishing_state_session_missing");
    }

    const draft = deepClone(current);
    const result = mutator ? mutator(draft) || draft : draft;
    result.updatedAt = this.clock().toISOString();
    this.sessions.set(sessionId, deepClone(result));
    return deepClone(result);
  }

  appendHistory(sessionId, event) {
    if (!event || !event.type) {
      throw new Error("publishing_state_history_requires_type");
    }

    return this.updateSession(sessionId, (state) => {
      state.history.push({
        type: event.type,
        occurredAt: this.clock().toISOString(),
        payload: deepClone(event.payload || {})
      });
      return state;
    });
  }
}

export {
  PublishingStateStore
};
