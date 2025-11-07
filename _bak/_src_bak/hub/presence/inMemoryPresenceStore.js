"use strict";

class InMemoryPresenceStore {
  constructor() {
    this.rooms = new Map();
  }

  async trackConnection({ roomId, connectionId, actorId, characterId, hubId, metadata = {} }) {
    if (!roomId || !connectionId) {
      throw new Error("presence_tracking_requires_room_and_connection");
    }
    const room = this.rooms.get(roomId) || new Map();
    room.set(connectionId, {
      hubId,
      roomId,
      connectionId,
      actorId,
      characterId,
      connectedAt: Date.now(),
      metadata
    });
    this.rooms.set(roomId, room);
    return room.get(connectionId);
  }

  async removeConnection({ roomId, connectionId }) {
    if (!roomId || !connectionId) {
      return;
    }
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }
    room.delete(connectionId);
    if (room.size === 0) {
      this.rooms.delete(roomId);
    }
  }

  async listRoomParticipants(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return [];
    }
    return Array.from(room.values());
  }

  async touch(roomId) {
    if (!roomId) {
      return;
    }
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }
    room.lastTouchedAt = Date.now();
  }
}

export {
  InMemoryPresenceStore
};
