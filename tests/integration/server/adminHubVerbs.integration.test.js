"use strict";

import request from "supertest";
import { newDb  } from "pg-mem.js";
import { v4: uuidv4  } from "uuid.js";
import { createApp  } from "../../../_src_bak/server/app.js";
import { HubVerbRepository,
  HubVerbCatalogStore,
  HubVerbService,
  VerbCatalog
 } from "../../../_src_bak/hub.js";

function createDatabase() {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  db.public.registerFunction({
    name: "gen_random_uuid",
    returns: "uuid",
    implementation: uuidv4
  });
  db.public.none(`
    CREATE TABLE hub_verbs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      hub_id text NULL,
      verb_id text NOT NULL,
      version integer NOT NULL,
      definition jsonb NOT NULL,
      capability_tags text[] NULL,
      safety_tags text[] NULL,
      moderation_tags text[] NULL,
      status text NOT NULL DEFAULT 'draft',
      audit_ref text NULL,
      created_by text NULL,
      updated_by text NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT hub_verbs_unique_version UNIQUE (hub_id, verb_id, version)
    );
  `);
  return db;
}

function createAppWithService() {
  const db = createDatabase();
  const adapter = db.adapters.createPg();
  const pool = new adapter.Pool();
  const repository = new HubVerbRepository({ client: pool });
  const fallbackCatalog = VerbCatalog.fromConfig({ verbs: [] });
  const catalogStore = new HubVerbCatalogStore({ repository, fallbackCatalog, clock: Date });
  const hubVerbService = new HubVerbService({ repository, catalogStore });

  const narrativeEngine = {
    async handlePlayerMessage() {
      return { narrativeEvent: null, checkRequest: null };
    },
    sessionMemory: {
      getMomentumState() {
        return { current: 0, floor: -2, ceiling: 3 };
      }
    }
  };

  const broadcaster = {
    register() {
      return () => {};
    },
    registerStream() {
      return () => {};
    },
    publish() {}
  };

  const checkBus = {
    onCheckRequest() {},
    onCheckResolved() {},
    onCheckVetoed() {},
    onAdminAlert() {},
    emitCheckResolved() {
      return {};
    }
  };

  const sessionMemory = {
    getOverlaySnapshot() {
      return {};
    },
    listPendingChecks() {
      return [];
    },
    listRecentResolvedChecks() {
      return [];
    },
    getSessionState() {
      return { changeCursor: 0, lastAckCursor: 0, pendingOfflineReconcile: false };
    },
    getAllShards() {
      return [];
    },
    getCapabilityReferences() {
      return [];
    },
    listChanges() {
      return [];
    },
    acknowledgeChanges() {
      return {};
    },
    getShard() {
      return {};
    },
    replaceShard() {
      return {};
    },
    recordPlayerControl() {
      return {};
    }
  };

  const app = createApp({
    narrativeEngine,
    checkBus,
    broadcaster,
    sessionMemory,
    hubVerbService
  });

  return { app, repository, catalogStore, hubVerbService, pool };
}

describe("admin hub verb routes", () => {
  test("creates, publishes, and lists hub verbs", async () => {
    const { app, pool } = createAppWithService();

    const createResponse = await request(app)
      .post("/admin/hubs/global/verbs")
      .set("X-Admin-User", "tester")
      .send({
        definition: {
          verbId: "verb.signal",
          label: "Signal",
          description: "Send a signal to other admins.",
          safetyTags: ["admin"],
          rateLimit: { burst: 2, perSeconds: 30, scope: "actor" },
          narrative: { escalation: "none" }
        },
        status: "draft",
        auditRef: "test-create"
      })
      .expect(201);

    expect(createResponse.body.verbs).toHaveLength(1);
    expect(createResponse.body.verbs[0].verbId).toBe("verb.signal");
    expect(createResponse.body.verbs[0].status).toBe("draft");
    expect(createResponse.body.verbs[0].updatedBy).toBe("tester");

    const publishResponse = await request(app)
      .post("/admin/hubs/global/verbs/verb.signal/publish")
      .set("X-Admin-User", "tester")
      .send({ auditRef: "test-publish" })
      .expect(200);

    const publishedVerb = publishResponse.body.verbs.find((entry) => entry.verbId === "verb.signal");
    expect(publishedVerb.status).toBe("active");
    expect(publishedVerb.updatedBy).toBe("tester");

    const listResponse = await request(app)
      .get("/admin/hubs/global/verbs")
      .set("X-Admin-User", "tester")
      .expect(200);

    expect(listResponse.body.verbs[0].status).toBe("active");
    await pool.end();
  });

  test("streams catalog updates over SSE", async () => {
    const { app, pool } = createAppWithService();

    await request(app)
      .post("/admin/hubs/global/verbs")
      .set("X-Admin-User", "tester")
      .send({
        definition: {
          verbId: "verb.call",
          label: "Call",
          rateLimit: { burst: 1, perSeconds: 10, scope: "actor" },
          narrative: { escalation: "auto" }
        }
      })
      .expect(201);

    const server = app.listen(0);
    const { port } = server.address();
    const controller = new AbortController();
    try {
      const response = await fetch(
        `http://127.0.0.1:${port}/admin/hubs/global/catalog/stream?adminUser=streamer`,
        {
          headers: {
            Accept: "text/event-stream"
          },
          signal: controller.signal
        }
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toMatch(/^text\/event-stream/);

      const reader = response.body.getReader();
      const firstChunk = await reader.read();
      expect(firstChunk.done).toBe(false);
      const payload = new TextDecoder().decode(firstChunk.value);
      expect(payload).toContain("catalog.sync");

      try {
        await reader.cancel();
      } catch (error) {
        if (error && error.name !== "AbortError") {
          throw error;
        }
      }
    } finally {
      controller.abort();
      server.close();
    }

    await pool.end();
  });
});
