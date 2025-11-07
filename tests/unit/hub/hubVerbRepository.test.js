"use strict";

import { randomUUID  } from "crypto.js";
import { newDb  } from "pg-mem.js";
import { HubVerbRepository  } from "../../../_src_bak/hub/verbs/hubVerbRepository.js";

function createDatabase() {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  db.public.registerFunction({
    name: "gen_random_uuid",
    returns: "uuid",
    implementation: () => randomUUID(),
    impure: true
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

describe("HubVerbRepository", () => {
  let db;
  let pool;
  let repository;

  beforeEach(() => {
    db = createDatabase();
    const adapter = db.adapters.createPg();
    pool = new adapter.Pool();
    repository = new HubVerbRepository({ client: pool });
  });

  afterEach(async () => {
    if (pool) {
      await pool.end();
    }
  });

  test("listActiveVerbs merges global defaults with hub overrides", async () => {
    await pool.query(
      `INSERT INTO hub_verbs (hub_id, verb_id, version, definition, status)
       VALUES (NULL, 'verb.say', 1, $1::jsonb, 'active')`,
      [JSON.stringify({ verbId: "verb.say", label: "Say" })]
    );
    await pool.query(
      `INSERT INTO hub_verbs (hub_id, verb_id, version, definition, status)
       VALUES (NULL, 'verb.trade', 1, $1::jsonb, 'active')`,
      [JSON.stringify({ verbId: "verb.trade", label: "Trade" })]
    );
    await pool.query(
      `INSERT INTO hub_verbs (hub_id, verb_id, version, definition, status)
       VALUES ('hub-1', 'verb.say', 2, $1::jsonb, 'active')`,
      [JSON.stringify({ verbId: "verb.say", label: "Say (Hub 1)" })]
    );
    await pool.query(
      `INSERT INTO hub_verbs (hub_id, verb_id, version, definition, status)
       VALUES ('hub-1', 'verb.say', 1, $1::jsonb, 'deprecated')`,
      [JSON.stringify({ verbId: "verb.say", label: "Old Say" })]
    );

    const results = await repository.listActiveVerbs({ hubId: "hub-1" });

    expect(results).toHaveLength(2);
    const say = results.find((row) => row.verbId === "verb.say");
    const trade = results.find((row) => row.verbId === "verb.trade");
    expect(say.definition.label).toBe("Say (Hub 1)");
    expect(say.version).toBe(2);
    expect(trade.definition.label).toBe("Trade");
  });

  test("createVersion increments version and stores metadata", async () => {
    const first = await repository.createVersion({
      verbId: "verb.invoke",
      hubId: null,
      definition: { verbId: "verb.invoke", label: "Invoke" },
      capabilityTags: ["capability.test"],
      safetyTags: ["safety"],
      status: "active",
      auditRef: "unit-test",
      createdBy: "tester"
    });

    const second = await repository.createVersion({
      verbId: "verb.invoke",
      hubId: null,
      definition: { verbId: "verb.invoke", label: "Invoke v2" },
      status: "draft",
      auditRef: "unit-test-2",
      createdBy: "tester"
    });

    expect(first.version).toBe(1);
    expect(second.version).toBe(2);
    expect(second.definition.label).toBe("Invoke v2");
    expect(first.updatedBy).toBe("tester");
    expect(second.updatedBy).toBe("tester");

    const history = await repository.listHistory({ hubId: null, verbId: "verb.invoke" });
    expect(history).toHaveLength(2);
    expect(history[0].version).toBe(2);
    expect(history[1].version).toBe(1);
  });

  test("setStatus updates the requested record", async () => {
    await repository.createVersion({
      hubId: "hub-2",
      verbId: "verb.wave",
      definition: { verbId: "verb.wave", label: "Wave" },
      status: "draft",
      auditRef: "draft",
      createdBy: "tester"
    });

    const [updated] = await repository.setStatus({
      hubId: "hub-2",
      verbId: "verb.wave",
      status: "active",
      auditRef: "publish",
      performedBy: "moderator"
    });

    expect(updated.status).toBe("active");
    expect(updated.auditRef).toBe("publish");
    expect(updated.createdBy).toBe("tester");
    expect(updated.updatedBy).toBe("moderator");
  });

  test("listLatestVerbs returns latest records for requested statuses", async () => {
    await repository.createVersion({
      hubId: "hub-3",
      verbId: "verb.greet",
      definition: { verbId: "verb.greet", label: "Greet" },
      status: "draft",
      auditRef: "draft",
      createdBy: "tester"
    });
    await repository.createVersion({
      hubId: "hub-3",
      verbId: "verb.greet",
      definition: { verbId: "verb.greet", label: "Greet Published" },
      status: "active",
      auditRef: "publish",
      createdBy: "tester"
    });

    const latest = await repository.listLatestVerbs({
      hubId: "hub-3",
      statuses: ["draft", "active"]
    });

    expect(latest).toHaveLength(1);
    expect(latest[0].status).toBe("active");
    expect(latest[0].definition.label).toBe("Greet Published");
  });
});
