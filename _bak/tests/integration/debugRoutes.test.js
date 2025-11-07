"use strict";

import request from "supertest";
import { createApp  } from "../../_src_bak/server/app.js";
import { SessionMemoryFacade  } from "../../_src_bak/memory/sessionMemory.js";
import { CheckBus  } from "../../_src_bak/events/checkBus.js";
import { Broadcaster  } from "../../_src_bak/server/broadcaster.js";
import { SessionClosureCoordinator  } from "../../_src_bak/offline/sessionClosureCoordinator.js";

function buildApp({ enableDebug = false } = {}) {
  if (enableDebug) {
    process.env.ENABLE_DEBUG_ENDPOINTS = "true";
  } else {
    delete process.env.ENABLE_DEBUG_ENDPOINTS;
  }

  const sessionMemory = new SessionMemoryFacade();
  const checkBus = new CheckBus();
  const broadcaster = new Broadcaster();
  const offlineCoordinator = new SessionClosureCoordinator({
    publisher: {
      publish: () => {}
    }
  });
  const narrativeEngine = {
    async handlePlayerMessage() {
      return {
        narrativeEvent: {
          type: "session.message",
          payload: { content: "debug" }
        },
        checkRequest: null
      };
    }
  };

  const app = createApp({
    narrativeEngine,
    checkBus,
    broadcaster,
    sessionMemory,
    offlineCoordinator,
    seedAccounts: true
  });

  return {
    app,
    sessionMemory,
    checkBus
  };
}

describe("debug endpoints", () => {
  afterEach(() => {
    delete process.env.ENABLE_DEBUG_ENDPOINTS;
  });

  test("returns 404 when debug endpoints are disabled", async () => {
    const { app } = buildApp({ enableDebug: false });
    const agent = request(app);

    const login = await agent
      .post("/auth/login")
      .send({ email: "admin@glassfrontier", password: "admin-pass" })
      .expect(200);

    const token = login.body?.token;
    expect(typeof token).toBe("string");

    const sessionId = "debug-disabled-session";
    await agent
      .post("/accounts/me/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({ sessionId, title: "Debug Disabled" })
      .expect(201);

    const response = await agent
      .post(`/debug/sessions/${encodeURIComponent(sessionId)}/checks`)
      .set("Authorization", `Bearer ${token}`)
      .send({ move: "probe-network" });

    expect(response.status).toBe(404);
  });

  test("emits check requests via debug endpoint when enabled", async () => {
    const { app, sessionMemory, checkBus } = buildApp({ enableDebug: true });
    const agent = request(app);
    const checkSpy = jest.spyOn(checkBus, "emitCheckRequest");

    const login = await agent
      .post("/auth/login")
      .send({ email: "admin@glassfrontier", password: "admin-pass" })
      .expect(200);
    const token = login.body?.token;

    const sessionId = "debug-check-session";
    await agent
      .post("/accounts/me/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({ sessionId, title: "Debug Check Session" })
      .expect(201);

    const response = await agent
      .post(`/debug/sessions/${encodeURIComponent(sessionId)}/checks`)
      .set("Authorization", `Bearer ${token}`)
      .send({ move: "debug-probe", stat: "finesse", statValue: 2 })
      .expect(202);

    expect(response.body?.check?.id).toBeDefined();
    expect(checkSpy).toHaveBeenCalledTimes(1);
    expect(checkSpy).toHaveBeenCalledWith(sessionId, expect.objectContaining({ move: "debug-probe" }));

    const pendingChecks = sessionMemory.listPendingChecks(sessionId);
    expect(pendingChecks.length).toBeGreaterThan(0);
  });

  test("emits admin alerts via debug endpoint when enabled", async () => {
    const { app, checkBus } = buildApp({ enableDebug: true });
    const agent = request(app);
    const alertSpy = jest.spyOn(checkBus, "emitAdminAlert");

    const login = await agent
      .post("/auth/login")
      .send({ email: "admin@glassfrontier", password: "admin-pass" })
      .expect(200);
    const token = login.body?.token;

    const sessionId = "debug-alert-session";
    await agent
      .post("/accounts/me/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({ sessionId, title: "Debug Alert Session" })
      .expect(201);

    await agent
      .post(`/debug/sessions/${encodeURIComponent(sessionId)}/admin-alerts`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "debug.alert.test", severity: "high", data: { note: "integration" } })
      .expect(202);

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId,
        reason: "debug.alert.test",
        severity: "high"
      })
    );

    const unauthorized = await agent
      .post(`/debug/sessions/${encodeURIComponent(sessionId)}/admin-alerts`)
      .send({ reason: "without-token" });

    expect(unauthorized.status).toBe(401);
  });
});

