"use strict";

const { randomUUID } = require("crypto");
const { newDb } = require("pg-mem");
const { PostgresPublishingStateStore } = require("../../../src/offline/publishing/postgresPublishingStateStore");

function createDatabase() {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  db.public.registerFunction({
    name: "gen_random_uuid",
    returns: "uuid",
    implementation: () => randomUUID(),
    impure: true
  });
  db.public.none(`
    CREATE TABLE publishing_cadence_state (
      session_id uuid PRIMARY KEY,
      state jsonb NOT NULL,
      history jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  return db;
}

describe("PostgresPublishingStateStore", () => {
  let db;
  let pool;
  let store;

  beforeEach(() => {
    db = createDatabase();
    const adapter = db.adapters.createPg();
    pool = new adapter.Pool();
    store = new PostgresPublishingStateStore({ client: pool, clock: () => new Date("2025-11-05T10:00:00.000Z") });
  });

  afterEach(async () => {
    if (pool) {
      await pool.end();
    }
  });

  test("creates and retrieves a publishing cadence session", async () => {
    const sessionId = randomUUID();
    await store.createSession(sessionId, {
      sessionClosedAt: "2025-11-05T09:00:00.000Z",
      moderation: {
        startAt: "2025-11-05T09:15:00.000Z",
        endAt: "2025-11-05T10:00:00.000Z",
        status: "scheduled"
      },
      batches: [
        { batchId: `${sessionId}-batch-0`, runAt: "2025-11-05T10:30:00.000Z", status: "scheduled" }
      ],
      digest: {
        runAt: "2025-11-06T02:00:00.000Z",
        status: "scheduled"
      }
    });

    const schedule = await store.getSession(sessionId);
    expect(schedule).not.toBeNull();
    expect(schedule.sessionId).toBe(sessionId);
    expect(schedule.batches).toHaveLength(1);
    expect(Array.isArray(schedule.history)).toBe(true);
  });

  test("updates a session via mutator", async () => {
    const sessionId = randomUUID();
    await store.createSession(sessionId, {
      sessionClosedAt: "2025-11-05T09:00:00.000Z",
      moderation: {
        startAt: "2025-11-05T09:15:00.000Z",
        endAt: "2025-11-05T10:00:00.000Z",
        status: "scheduled"
      },
      batches: [
        { batchId: `${sessionId}-batch-0`, runAt: "2025-11-05T10:30:00.000Z", status: "scheduled" }
      ],
      digest: {
        runAt: "2025-11-06T02:00:00.000Z",
        status: "scheduled"
      }
    });

    const updated = await store.updateSession(sessionId, (state) => {
      state.batches[0].status = "deferred";
      state.batches[0].override = { reason: "moderation_hold" };
      return state;
    });

    expect(updated.batches[0].status).toBe("deferred");
    expect(updated.batches[0].override.reason).toBe("moderation_hold");
  });

  test("appends history entries", async () => {
    const sessionId = randomUUID();
    await store.createSession(sessionId, {
      sessionClosedAt: "2025-11-05T09:00:00.000Z",
      moderation: { status: "scheduled" },
      batches: [],
      digest: null
    });

    const result = await store.appendHistory(sessionId, {
      type: "cadence.test",
      payload: { note: "deferred" }
    });

    expect(result.history).toHaveLength(1);
    expect(result.history[0].type).toBe("cadence.test");
    expect(result.history[0].payload.note).toBe("deferred");
  });
});
