"use strict";

const request = require("supertest");
const { createApp } = require("../../../src/server/app");
const { SessionMemoryFacade } = require("../../../src/memory/sessionMemory");
const { CheckBus } = require("../../../src/events/checkBus");
const { Broadcaster } = require("../../../src/server/broadcaster");
const { NarrativeEngine } = require("../../../src/narrative/narrativeEngine");

describe("moderation routes", () => {
  let app;
  let token;
  let checkBus;

  beforeEach(async () => {
    const sessionMemory = new SessionMemoryFacade();
    checkBus = new CheckBus();
    const broadcaster = new Broadcaster();
    const narrativeEngine = new NarrativeEngine({ sessionMemory, checkBus });

    app = createApp({
      narrativeEngine,
      checkBus,
      broadcaster,
      sessionMemory,
      seedAccounts: true
    });

    const response = await request(app)
      .post("/auth/login")
      .send({ email: "admin@glassfrontier", password: "admin-pass" });
    token = response.body.token;
  });

  test("lists moderation alerts for admin users", async () => {
    checkBus.emitAdminAlert({ sessionId: "session-alert", reason: "test.alert" });

    const response = await request(app)
      .get("/admin/moderation/alerts")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.alerts)).toBe(true);
    expect(response.body.alerts.length).toBeGreaterThan(0);
  });

  test("allows moderators to apply decisions", async () => {
    const envelope = checkBus.emitAdminAlert({
      sessionId: "session-decision",
      reason: "offline.workflow_failed",
      severity: "critical"
    });

    const response = await request(app)
      .post(`/admin/moderation/alerts/${envelope.id}/decision`)
      .set("Authorization", `Bearer ${token}`)
      .send({ action: "approve", notes: "workflow confirmed" });

    expect(response.status).toBe(200);
    expect(response.body.alert).toBeDefined();
    expect(response.body.alert.status).toBe("resolved");
  });
});
