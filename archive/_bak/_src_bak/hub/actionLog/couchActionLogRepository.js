"use strict";

/**
 * CouchDB-backed action log repository.
 * Expects a nano-like client with `.db.use(databaseName)` support.
 */
class CouchActionLogRepository {
  constructor({ client, database }) {
    this.db = client.db.use(database);
  }

  async append({ roomId, entry }) {
    const doc = {
      type: "hub.action",
      roomId,
      hubId: entry.hubId,
      actorId: entry.actorId,
      narrativeEscalation: entry.narrativeEscalation || null,
      issuedAt: entry.metadata?.issuedAt || Date.now(),
      command: entry.command,
      telemetry: entry.telemetry || null
    };
    await this.db.insert(doc);
  }

  async getReplay({ roomId, since = 0, limit = 50 }) {
    const selector = {
      selector: {
        type: "hub.action",
        roomId,
        issuedAt: { $gte: since }
      },
      sort: [{ issuedAt: "asc" }],
      limit
    };
    const { docs } = await this.db.find(selector);
    return docs.map((doc) => ({
      id: doc._id,
      actorId: doc.actorId,
      hubId: doc.hubId,
      metadata: {
        issuedAt: doc.issuedAt
      },
      command: doc.command,
      telemetry: doc.telemetry
    }));
  }
}

export {
  CouchActionLogRepository
};
