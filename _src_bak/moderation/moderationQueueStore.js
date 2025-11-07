"use strict";

const DEFAULT_TABLE = "moderation_queue_state";

function deepClone(value) {
  if (value === undefined || value === null) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

function normaliseQueueState(sessionId, state) {
  if (!sessionId) {
    throw new Error("moderation_queue_store_requires_session_id");
  }
  if (!state || typeof state !== "object") {
    throw new Error("moderation_queue_store_requires_state");
  }

  const queue = {
    sessionId,
    generatedAt: state.generatedAt || null,
    updatedAt: state.updatedAt || state.generatedAt || null,
    pendingCount: Number.isFinite(state.pendingCount) ? Number(state.pendingCount) : 0,
    items: Array.isArray(state.items) ? state.items.map((item) => deepClone(item)) : [],
    window: state.window ? deepClone(state.window) : null,
    cadence: state.cadence ? deepClone(state.cadence) : null
  };

  return queue;
}

class ModerationQueueStore {
  constructor({ client, tableName = DEFAULT_TABLE, clock = () => new Date() } = {}) {
    if (!client || typeof client.query !== "function") {
      throw new Error("ModerationQueueStore requires a query-capable client");
    }
    this.client = client;
    this.tableName = tableName;
    this.clock = clock;
  }

  async saveQueue(sessionId, state) {
    const normalised = normaliseQueueState(sessionId, state);
    const updatedAt = normalised.updatedAt || this.clock().toISOString();
    const payload = {
      sessionId: normalised.sessionId,
      pendingCount: normalised.pendingCount,
      state: JSON.stringify({
        generatedAt: normalised.generatedAt,
        updatedAt,
        pendingCount: normalised.pendingCount,
        items: normalised.items,
        window: normalised.window,
        cadence: normalised.cadence
      })
    };
    normalised.updatedAt = updatedAt;

    const text = `
      INSERT INTO ${this.tableName} (session_id, state, pending_count, updated_at, created_at)
      VALUES ($1::uuid, $2::jsonb, $3::integer, NOW(), NOW())
      ON CONFLICT (session_id)
      DO UPDATE SET
        state = EXCLUDED.state,
        pending_count = EXCLUDED.pending_count,
        updated_at = NOW()
    `;

    await this.client.query(text, [payload.sessionId, payload.state, payload.pendingCount]);
    return normalised;
  }

  async deleteQueue(sessionId) {
    if (!sessionId) {
      throw new Error("moderation_queue_store_requires_session_id");
    }
    await this.client.query(`DELETE FROM ${this.tableName} WHERE session_id = $1`, [sessionId]);
  }

  async getQueue(sessionId) {
    if (!sessionId) {
      throw new Error("moderation_queue_store_requires_session_id");
    }
    const result = await this.client.query(
      `SELECT session_id AS "sessionId", state, pending_count AS "pendingCount", updated_at AS "updatedAt"
         FROM ${this.tableName}
        WHERE session_id = $1`,
      [sessionId]
    );
    if (result.rows.length === 0) {
      return null;
    }
    return mapRow(result.rows[0]);
  }

  async listQueues() {
    const result = await this.client.query(
      `SELECT session_id AS "sessionId", state, pending_count AS "pendingCount", updated_at AS "updatedAt"
         FROM ${this.tableName}
        ORDER BY updated_at DESC`
    );
    return result.rows.map(mapRow);
  }
}

function mapRow(row) {
  const rawState = typeof row.state === "string" ? JSON.parse(row.state) : row.state || {};
  return {
    sessionId: row.sessionId,
    pendingCount: row.pendingCount ?? rawState.pendingCount ?? 0,
    updatedAt: row.updatedAt || rawState.updatedAt || null,
    state: {
      generatedAt: rawState.generatedAt || null,
      updatedAt: rawState.updatedAt || null,
      pendingCount: rawState.pendingCount ?? 0,
      items: Array.isArray(rawState.items) ? rawState.items.map((item) => deepClone(item)) : [],
      window: rawState.window ? deepClone(rawState.window) : null,
      cadence: rawState.cadence ? deepClone(rawState.cadence) : null
    }
  };
}

export {
  ModerationQueueStore
};
