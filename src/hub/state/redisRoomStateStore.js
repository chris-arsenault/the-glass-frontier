"use strict";

const DEFAULT_TTL_SECONDS = 60 * 30;

function deepClone(value) {
  if (value === null || value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

function parseJson(value) {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
}

class RedisRoomStateStore {
  constructor({
    redis,
    prefix = "roomState",
    trackersPrefix = "trackers",
    ttlSeconds = DEFAULT_TTL_SECONDS,
    clock = Date
  } = {}) {
    if (!redis || typeof redis.multi !== "function") {
      throw new Error("RedisRoomStateStore requires a redis client with multi support");
    }
    this.redis = redis;
    this.prefix = prefix;
    this.trackersPrefix = trackersPrefix;
    this.ttlSeconds = ttlSeconds;
    this.clock = clock;
  }

  _now() {
    return typeof this.clock.now === "function" ? this.clock.now() : Date.now();
  }

  _roomKey(hubId, roomId) {
    const resolvedHubId = hubId || "GLOBAL";
    return `${this.prefix}:${resolvedHubId}:${roomId}`;
  }

  _trackerKey(sessionId) {
    return `${this.trackersPrefix}:${sessionId}`;
  }

  async getRoomState({ hubId = null, roomId }) {
    if (!roomId) {
      throw new Error("roomId is required");
    }
    const key = this._roomKey(hubId, roomId);
    const fields = await this.redis.hGetAll(key);
    if (!fields || Object.keys(fields).length === 0) {
      return {
        hubId,
        roomId,
        state: {},
        version: 0,
        updatedAt: null
      };
    }

    return {
      hubId,
      roomId,
      state: parseJson(fields.state) || {},
      version: fields.version ? Number(fields.version) : 0,
      updatedAt: fields.updatedAt ? Number(fields.updatedAt) : null
    };
  }

  async updateRoomState({ hubId = null, roomId, apply }) {
    if (!roomId) {
      throw new Error("roomId is required");
    }
    if (typeof apply !== "function") {
      throw new Error("updateRoomState requires an apply function");
    }

    const current = await this.getRoomState({ hubId, roomId });
    const workingState = deepClone(current.state || {});
    const applied = apply(workingState);
    const nextState = applied ? deepClone(applied) : workingState;

    const now = this._now();
    const key = this._roomKey(hubId, roomId);
    const stateJson = JSON.stringify(nextState);

    const pipeline = this.redis.multi();
    pipeline.hSet(key, {
      hubId: hubId || "",
      roomId,
      state: stateJson,
      updatedAt: now
    });
    pipeline.hIncrBy(key, "version", 1);
    if (this.ttlSeconds) {
      pipeline.expire(key, this.ttlSeconds);
    }
    const results = await pipeline.exec();
    const versionReply = Array.isArray(results?.[1]) ? results[1][1] : results?.[1];
    const version = versionReply ? Number(versionReply) : current.version + 1 || 1;

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

    const key = this._trackerKey(sessionId);
    const now = this._now();
    const payload = {};
    if (hubId) {
      payload.hubId = hubId;
    }
    if (roomId) {
      payload.roomId = roomId;
    }
    if (actorId) {
      payload.actorId = actorId;
    }
    if (verbId) {
      payload.verbId = verbId;
    }
    if (stateVersion !== null && stateVersion !== undefined) {
      payload.stateVersion = String(stateVersion);
    }
    if (issuedAt !== null && issuedAt !== undefined) {
      payload.issuedAt = String(issuedAt);
    }
    payload.recordedAt = String(now);
    if (state) {
      payload.state = JSON.stringify(state);
    }

    const id = await this.redis.xAdd(key, "*", payload);
    if (this.ttlSeconds) {
      await this.redis.expire(key, this.ttlSeconds);
    }

    return {
      id,
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
  }

  async listTrackers({ sessionId, since = 0, limit = 50 } = {}) {
    if (!sessionId) {
      return [];
    }

    const key = this._trackerKey(sessionId);
    const count = limit && limit > 0 ? limit : 50;
    const entries = await this.redis.xRange(key, "-", "+", { COUNT: count });
    if (!entries) {
      return [];
    }

    const mapped = entries
      .map(([id, fieldEntries]) => {
        const fields = Object.fromEntries(fieldEntries);
        const recordedAt = fields.recordedAt ? Number(fields.recordedAt) : null;
        return {
          id,
          sessionId,
          hubId: fields.hubId || null,
          roomId: fields.roomId || null,
          actorId: fields.actorId || null,
          verbId: fields.verbId || null,
          stateVersion: fields.stateVersion ? Number(fields.stateVersion) : null,
          issuedAt: fields.issuedAt ? Number(fields.issuedAt) : null,
          recordedAt,
          state: parseJson(fields.state)
        };
      })
      .filter((entry) => (since ? entry.recordedAt > since : true));

    if (!limit || mapped.length <= limit) {
      return mapped;
    }

    return mapped.slice(mapped.length - limit);
  }
}

module.exports = {
  RedisRoomStateStore
};
