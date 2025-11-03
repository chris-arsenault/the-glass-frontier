"use strict";

const EventEmitter = require("events");
const { HubVerbCatalogStore } = require("../../../src/hub/verbs/hubVerbCatalogStore");
const { VerbCatalog } = require("../../../src/hub/verbCatalog");

function createFallbackCatalog() {
  return VerbCatalog.fromConfig({
    verbs: [
      {
        verbId: "verb.say",
        label: "Say",
        rateLimit: { burst: 5, perSeconds: 10 }
      },
      {
        verbId: "verb.trade",
        label: "Trade",
        rateLimit: { burst: 3, perSeconds: 30 }
      }
    ]
  });
}

describe("HubVerbCatalogStore", () => {
  test("ensureCatalog caches the latest catalog per hub", async () => {
    const calls = [];
    const repository = {
      async listActiveVerbs({ hubId }) {
        calls.push(hubId);
        return [
          {
            hubId,
            verbId: "verb.say",
            version: 2,
            definition: { verbId: "verb.say", label: `Say-${hubId}` },
            updatedAt: new Date("2025-11-04T10:00:00Z")
          }
        ];
      }
    };
    const store = new HubVerbCatalogStore({
      repository,
      fallbackCatalog: createFallbackCatalog(),
      clock: { now: () => Date.now() },
      ttlMs: 60000
    });

    const first = await store.ensureCatalog("hub-1");
    const second = await store.ensureCatalog("hub-1");

    expect(first).toBe(second);
    expect(calls).toEqual(["hub-1"]);
    const verbs = store.listVerbs("hub-1");
    expect(verbs[0].label).toBe("Say-hub-1");
  });

  test("fallback catalog fills in missing verb definitions", async () => {
    const repository = {
      async listActiveVerbs() {
        return [];
      }
    };
    const fallback = createFallbackCatalog();
    const store = new HubVerbCatalogStore({
      repository,
      fallbackCatalog: fallback,
      clock: { now: () => Date.now() },
      ttlMs: 1000
    });

    const catalog = await store.ensureCatalog("hub-2");
    expect(catalog.get("verb.say")).toBeDefined();
    expect(catalog.get("verb.trade")).toBeDefined();
  });

  test("reload emits catalogUpdated when version stamp changes", async () => {
    const emitter = new EventEmitter();
    const repository = {
      async listActiveVerbs() {
        return [
          {
            hubId: null,
            verbId: "verb.wave",
            version: 1,
            definition: { verbId: "verb.wave", label: "Wave" },
            updatedAt: new Date("2025-11-04T10:00:00Z")
          }
        ];
      }
    };

    const store = new HubVerbCatalogStore({
      repository,
      fallbackCatalog: createFallbackCatalog(),
      clock: { now: () => Date.now() },
      ttlMs: 100
    });

    const updates = [];
    store.on("catalogUpdated", (payload) => updates.push(payload));

    await store.ensureCatalog(null);
    await store.reload(null);

    expect(updates).toHaveLength(1);
    expect(updates[0].verbs.some((verb) => verb.verbId === "verb.wave")).toBe(true);
  });
});

