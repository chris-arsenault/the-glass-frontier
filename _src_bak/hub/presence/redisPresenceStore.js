"use strict";

/**
 * Redis-backed presence store implementation.
 * Expects two Redis clients:
 * - presenceRedis: stores active participants via sorted sets/hashes.
 * - logRedis: appends action logs using Redis Streams or lists.
 */
class RedisPresenceStore {
  constructor({ presenceRedis, logRedis, clock = Date }) {
    this.presenceRedis = presenceRedis;
    this.logRedis = logRedis || presenceRedis;
    this.clock = clock;
  }

  _now() {
    return typeof this.clock.now === "function" ? this.clock.now() : Date.now();
  }

  async trackConnection({ hubId, roomId, connectionId, actorId, characterId, metadata = {} }) {
    const now = this._now();
    const presenceKey = `presence:${roomId}`;
    const connectionKey = `presence:${roomId}:${connectionId}`;

    const multi = this.presenceRedis.multi();
    multi.zAdd(presenceKey, { score: now, value: connectionId });
    multi.hSet(connectionKey, {
      hubId,
      roomId,
      connectionId,
      actorId: actorId || "",
      characterId: characterId || "",
      connectedAt: now,
      metadata: JSON.stringify(metadata)
    });
    multi.expire(presenceKey, 60 * 10);
    multi.expire(connectionKey, 60 * 10);
    await multi.exec();

    return {
      hubId,
      roomId,
      connectionId,
      actorId,
      characterId,
      connectedAt: now,
      metadata
    };
  }

  async removeConnection({ roomId, connectionId }) {
    if (!roomId || !connectionId) {
      return;
    }
    const presenceKey = `presence:${roomId}`;
    const connectionKey = `presence:${roomId}:${connectionId}`;
    await this.presenceRedis
      .multi()
      .zRem(presenceKey, connectionId)
      .del(connectionKey)
      .exec();
  }

  async listRoomParticipants(roomId) {
    const presenceKey = `presence:${roomId}`;
    const connectionIds = await this.presenceRedis.zRange(presenceKey, 0, -1);
    if (!connectionIds || connectionIds.length === 0) {
      return [];
    }

    const multi = this.presenceRedis.multi();
    connectionIds.forEach((connectionId) => {
      const connectionKey = `presence:${roomId}:${connectionId}`;
      multi.hGetAll(connectionKey);
    });
    const entries = await multi.exec();

    return entries.map(([, payload], index) => {
      const raw = payload || {};
      const metadata = raw.metadata ? JSON.parse(raw.metadata) : {};
      return {
        connectionId: connectionIds[index],
        roomId,
        hubId: raw.hubId || null,
        actorId: raw.actorId || null,
        characterId: raw.characterId || null,
        connectedAt: Number(raw.connectedAt) || null,
        metadata
      };
    });
  }

  async appendAction({ roomId, entry }) {
    if (!roomId || !entry) {
      return;
    }
    const streamKey = `hub:actionLog:${roomId}`;
    const payload = {
      command: JSON.stringify(entry.command),
      actorId: entry.actorId || "",
      issuedAt: entry.metadata?.issuedAt || this._now(),
      envelopeType: entry.envelopeType || "hub.command",
      telemetry: JSON.stringify(entry.telemetry || null)
    };
    await this.logRedis.xAdd(streamKey, "*", payload);
  }

  async getReplay({ roomId, since = 0, limit = 50 }) {
    const streamKey = `hub:actionLog:${roomId}`;
    const start = since > 0 ? `${since}` : "-";
    const end = "+";
    const messages = await this.logRedis.xRange(streamKey, start, end, { COUNT: limit });
    return messages.map(([id, fields]) => {
      const body = Object.fromEntries(fields);
      return {
        id,
        command: JSON.parse(body.command),
        actorId: body.actorId,
        metadata: {
          issuedAt: Number(body.issuedAt)
        },
        envelopeType: body.envelopeType
      };
    });
  }
}

export {
  RedisPresenceStore
};
