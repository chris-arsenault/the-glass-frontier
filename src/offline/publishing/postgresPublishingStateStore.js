"use strict";

const { v4: uuid } = require("uuid");

const DEFAULT_TABLE = "publishing_cadence_state";

function deepClone(value) {
  if (value === undefined || value === null) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

class PostgresPublishingStateStore {
  constructor({ client, tableName = DEFAULT_TABLE, clock = () => new Date() } = {}) {
    if (!client || typeof client.query !== "function") {
      throw new Error("PostgresPublishingStateStore requires a query-capable client");
    }
    this.client = client;
    this.tableName = tableName;
    this.clock = clock;
  }

  async createSession(sessionId, bootstrapState) {
    if (!sessionId) {
      throw new Error("publishing_state_requires_session_id");
    }
    if (!bootstrapState || typeof bootstrapState !== "object") {
      throw new Error("publishing_state_requires_state");
    }

    const now = this.clock().toISOString();
    const state = deepClone(bootstrapState);
    state.sessionId = sessionId;
    state.updatedAt = now;
    state.createdAt = now;
    state.stateId = state.stateId || uuid();
    if (!Array.isArray(state.history)) {
      state.history = [];
    }

    const text = `
      INSERT INTO ${this.tableName} (session_id, state, history, created_at, updated_at)
      VALUES ($1::uuid, $2::jsonb, $3::jsonb, $4::timestamptz, $4::timestamptz)
      ON CONFLICT (session_id)
      DO NOTHING
      RETURNING session_id AS "sessionId", state, history
    `;

    const history = JSON.stringify(state.history);
    const result = await this.client.query(text, [sessionId, JSON.stringify(state), history, now]);
    if (result.rows.length === 0) {
      return this.getSession(sessionId);
    }
    return mapStateRow(result.rows[0]);
  }

  async getSession(sessionId) {
    if (!sessionId) {
      throw new Error("publishing_state_requires_session_id");
    }

    const result = await this.client.query(
      `SELECT session_id AS "sessionId", state, history
         FROM ${this.tableName}
        WHERE session_id = $1`,
      [sessionId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return mapStateRow(result.rows[0]);
  }

  async updateSession(sessionId, mutator) {
    const current = await this.getSession(sessionId);
    if (!current) {
      throw new Error("publishing_state_session_missing");
    }

    const draft = deepClone(current);
    const updatedState = mutator ? mutator(draft) || draft : draft;
    updatedState.updatedAt = this.clock().toISOString();

    const text = `
      UPDATE ${this.tableName}
         SET state = $2::jsonb,
             history = $3::jsonb,
             updated_at = $4::timestamptz
       WHERE session_id = $1::uuid
       RETURNING session_id AS "sessionId", state, history
    `;

    const payload = JSON.stringify(updatedState);
    const history = JSON.stringify(updatedState.history || []);
    const updatedAt = updatedState.updatedAt;

    const result = await this.client.query(text, [sessionId, payload, history, updatedAt]);
    return mapStateRow(result.rows[0]);
  }

  async appendHistory(sessionId, event) {
    if (!event || !event.type) {
      throw new Error("publishing_state_history_requires_type");
    }

    return this.updateSession(sessionId, (state) => {
      if (!Array.isArray(state.history)) {
        state.history = [];
      }
      state.history.push({
        type: event.type,
        occurredAt: this.clock().toISOString(),
        payload: deepClone(event.payload || {})
      });
      return state;
    });
  }
}

function mapStateRow(row) {
  const parsedState = typeof row.state === "string" ? JSON.parse(row.state) : row.state || {};
  let history = [];
  if (Array.isArray(parsedState.history)) {
    history = parsedState.history.map((entry) => deepClone(entry));
  } else if (row.history) {
    const parsedHistory =
      typeof row.history === "string" ? JSON.parse(row.history) : row.history;
    history = Array.isArray(parsedHistory)
      ? parsedHistory.map((entry) => deepClone(entry))
      : [];
  }

  const state = {
    ...parsedState,
    history
  };
  if (!state.sessionId) {
    state.sessionId = row.sessionId;
  }
  return state;
}

module.exports = {
  PostgresPublishingStateStore
};
