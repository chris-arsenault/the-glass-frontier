"use strict";

const { v4: uuidv4 } = require("uuid");

function deepClone(value) {
  if (value === null || value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

class InMemoryRoomStateStore {
  constructor({ clock = Date, initialStateFactory = null, trackerRetention = 1000 } = {}) {
    this.clock = clock;
    this.initialStateFactory =
      typeof initialStateFactory === "function" ? initialStateFactory : () => ({});
    this.trackerRetention = trackerRetention;
    this.rooms = new Map();
    this.trackers = new Map();
    this.trackerCounter = 0;
  }

  _now() {
    return typeof this.clock.now === "function" ? this.clock.now() : Date.now();
  }

  _roomKey(hubId, roomId) {
    const resolvedHubId = hubId || "GLOBAL";
    return `${resolvedHubId}:${roomId}`;
  }

  async getRoomState({ hubId = null, roomId }) {
    if (!roomId) {
      throw new Error("roomId is required");
    }
    const key = this._roomKey(hubId, roomId);
    const entry = this.rooms.get(key);
    if (!entry) {
      const initialState = deepClone(this.initialStateFactory({ hubId, roomId }) || {});
      return {
        hubId,
        roomId,
        state: initialState,
        version: 0,
        updatedAt: null
      };
    }

    return {
      hubId,
      roomId,
      state: deepClone(entry.state),
      version: entry.version,
      updatedAt: entry.updatedAt
    };
  }

  async updateRoomState({ hubId = null, roomId, apply }) {
    if (!roomId) {
      throw new Error("roomId is required");
    }
    if (typeof apply !== "function") {
      throw new Error("updateRoomState requires an apply function");
    }

    const key = this._roomKey(hubId, roomId);
    const existing = this.rooms.get(key);
    const baseState = existing
      ? deepClone(existing.state)
      : deepClone(this.initialStateFactory({ hubId, roomId }) || {});

    const workingState = deepClone(baseState);
    const result = apply(workingState);
    const nextState = result ? deepClone(result) : workingState;

    const now = this._now();
    const version = existing ? existing.version + 1 : 1;

    this.rooms.set(key, {
      state: deepClone(nextState),
      version,
      updatedAt: now
    });

    return {
      hubId,
      roomId,
      state: deepClone(nextState),
      version,
      updatedAt: now
    };
  }

  async recordTracker({
    sessionId,
    hubId = null,
    roomId = null,
    actorId = null,
    verbId = null,
    stateVersion = null,
    issuedAt = null,
    state = null
  }) {
    if (!sessionId) {
      return null;
    }

    const key = sessionId;
    const now = this._now();
    const entry = {
      id: uuidv4(),
      sessionId,
      hubId,
      roomId,
      actorId,
      verbId,
      stateVersion,
      issuedAt,
      recordedAt: now,
      state: state ? deepClone(state) : null
    };

    const list = this.trackers.get(key) || [];
    list.push(entry);
    if (list.length > this.trackerRetention) {
      list.shift();
    }
    this.trackers.set(key, list);

    return deepClone(entry);
  }

  async listTrackers({ sessionId, since = 0, limit = 50 } = {}) {
    if (!sessionId) {
      return [];
    }
    const list = this.trackers.get(sessionId) || [];
    const filtered = list.filter((entry) => entry.recordedAt > since);
    const capped = limit ? filtered.slice(Math.max(filtered.length - limit, 0)) : filtered;
    return capped.map((entry) => deepClone(entry));
  }
}

module.exports = {
  InMemoryRoomStateStore
};
