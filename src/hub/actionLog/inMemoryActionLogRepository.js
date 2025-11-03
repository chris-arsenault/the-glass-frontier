"use strict";

class InMemoryActionLogRepository {
  constructor() {
    this.logs = new Map();
  }

  async append({ roomId, entry }) {
    if (!roomId || !entry) {
      return;
    }
    const log = this.logs.get(roomId) || [];
    log.push({ ...entry, persistedAt: Date.now() });
    this.logs.set(roomId, log);
  }

  async getReplay({ roomId, since = 0, limit = 50 }) {
    const log = this.logs.get(roomId) || [];
    const filtered = log.filter((entry) => entry.metadata?.issuedAt >= since);
    if (limit && filtered.length > limit) {
      return filtered.slice(filtered.length - limit);
    }
    return filtered;
  }
}

module.exports = {
  InMemoryActionLogRepository
};
