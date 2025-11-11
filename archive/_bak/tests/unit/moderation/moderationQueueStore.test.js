"use strict";

import { randomUUID  } from "crypto.js";
import { newDb  } from "pg-mem.js";
import { ModerationQueueStore  } from "../../../_src_bak/moderation/moderationQueueStore.js";

function createDatabase() {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  db.public.registerFunction({
    name: "gen_random_uuid",
    returns: "uuid",
    implementation: () => randomUUID(),
    impure: true
  });
  db.public.none(`
    CREATE TABLE moderation_queue_state (
      session_id uuid PRIMARY KEY,
      state jsonb NOT NULL,
      pending_count integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  return db;
}

describe("ModerationQueueStore", () => {
  let db;
  let pool;
  let store;

  beforeEach(() => {
    db = createDatabase();
    const adapter = db.adapters.createPg();
    pool = new adapter.Pool();
    store = new ModerationQueueStore({ client: pool });
  });

  afterEach(async () => {
    if (pool) {
      await pool.end();
    }
  });

  test("persists a new moderation queue snapshot", async () => {
    const sessionId = randomUUID();
    const saved = await store.saveQueue(sessionId, {
      generatedAt: "2025-11-05T10:00:00.000Z",
      pendingCount: 2,
      items: [
        { deltaId: "delta-1", status: "needs-review", blocking: true },
        { deltaId: "delta-2", status: "needs-review", blocking: true }
      ],
      window: {
        status: "awaiting_review",
        startAt: "2025-11-05T10:15:00.000Z",
        endAt: "2025-11-05T10:45:00.000Z"
      },
      cadence: {
        nextBatchAt: "2025-11-05T11:00:00.000Z",
        nextDigestAt: "2025-11-06T02:00:00.000Z",
        batches: [],
        digest: null
      }
    });

    expect(saved.pendingCount).toBe(2);

    const retrieved = await store.getQueue(sessionId);
    expect(retrieved).not.toBeNull();
    expect(retrieved.state.pendingCount).toBe(2);
    expect(retrieved.state.items).toHaveLength(2);
  });

  test("updates existing queue snapshot on subsequent saves", async () => {
    const sessionId = randomUUID();
    await store.saveQueue(sessionId, {
      generatedAt: "2025-11-05T10:00:00.000Z",
      pendingCount: 2,
      items: [{ deltaId: "delta-1", status: "needs-review", blocking: true }]
    });

    await store.saveQueue(sessionId, {
      generatedAt: "2025-11-05T10:05:00.000Z",
      pendingCount: 1,
      items: [{ deltaId: "delta-1", status: "resolved", blocking: false }]
    });

    const retrieved = await store.getQueue(sessionId);
    expect(retrieved.state.pendingCount).toBe(1);
    expect(retrieved.state.items[0].status).toBe("resolved");
  });

  test("lists queues ordered by last update", async () => {
    const firstSession = randomUUID();
    const secondSession = randomUUID();
    await store.saveQueue(firstSession, {
      generatedAt: "2025-11-05T09:00:00.000Z",
      pendingCount: 1,
      items: [{ deltaId: "delta-first", status: "needs-review", blocking: true }]
    });
    await store.saveQueue(secondSession, {
      generatedAt: "2025-11-05T10:00:00.000Z",
      pendingCount: 2,
      items: [
        { deltaId: "delta-second-1", status: "needs-review", blocking: true },
        { deltaId: "delta-second-2", status: "needs-review", blocking: true }
      ]
    });

    const queues = await store.listQueues();
    expect(queues).toHaveLength(2);
    expect(queues[0].sessionId).toBe(secondSession);
    expect(queues[1].sessionId).toBe(firstSession);
  });
});
