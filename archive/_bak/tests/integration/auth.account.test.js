"use strict";

import request from "supertest";
import { createApp  } from "../../_src_bak/server/app.js";
import { NarrativeEngine  } from "../../_src_bak/narrative/narrativeEngine.js";
import { SessionMemoryFacade  } from "../../_src_bak/memory/sessionMemory.js";
import { CheckBus  } from "../../_src_bak/events/checkBus.js";
import { createStubLlmClient  } from "../helpers/createStubLlmClient.js";

describe("Account & auth API", () => {
  let app;
  let sessionMemory;
  let checkBus;
  let narrativeEngine;
  let broadcaster;
  let offlineCoordinator;

  beforeEach(() => {
    sessionMemory = new SessionMemoryFacade();
    checkBus = new CheckBus();
    narrativeEngine = new NarrativeEngine({
      sessionMemory,
      checkBus,
      llmClient: createStubLlmClient()
    });
    broadcaster = {
      publish: jest.fn(),
      registerStream: jest.fn()
    };
    offlineCoordinator = {
      enqueueClosure: jest.fn().mockReturnValue({
        jobId: "job-1",
        status: "queued"
      })
    };

    app = createApp({
      narrativeEngine,
      checkBus,
      broadcaster,
      sessionMemory,
      offlineCoordinator,
      seedAccounts: false
    });
  });

  test("registers and logs in a new account", async () => {
    const registerResponse = await request(app)
      .post("/auth/register")
      .send({
        email: "pilot@example.com",
        password: "frontier-pass",
        displayName: "Pilot"
      });

    expect(registerResponse.status).toBe(201);
    expect(registerResponse.body.account).toMatchObject({
      email: "pilot@example.com",
      displayName: "Pilot",
      roles: ["player"]
    });
    expect(registerResponse.body.token).toBeDefined();

    const loginResponse = await request(app)
      .post("/auth/login")
      .send({
        email: "pilot@example.com",
        password: "frontier-pass"
      });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.token).toBeDefined();
    expect(loginResponse.body.account.email).toBe("pilot@example.com");
  });

  test("requires auth token for account routes", async () => {
    const response = await request(app).get("/accounts/me/sessions");
    expect(response.status).toBe(401);
  });

  test("lists, creates, resumes, and approves sessions", async () => {
    const registerResponse = await request(app)
      .post("/auth/register")
      .send({
        email: "admin@example.com",
        password: "frontier-admin",
        displayName: "Admin",
        roles: ["player", "admin"]
      });

    const { token } = registerResponse.body;
    const authHeader = { Authorization: `Bearer ${token}` };

    let sessionsResponse = await request(app).get("/accounts/me/sessions").set(authHeader);
    expect(sessionsResponse.status).toBe(200);
    expect(sessionsResponse.body.sessions).toEqual([]);

    const createResponse = await request(app)
      .post("/accounts/me/sessions")
      .set(authHeader)
      .send({
        title: "Glass Frontier Chronicle",
        sessionId: "demo-session",
        requiresApproval: true
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.session.sessionId).toBe("demo-session");

    const resumeResponse = await request(app)
      .post("/accounts/me/sessions/demo-session/resume")
      .set(authHeader);
    expect(resumeResponse.status).toBe(200);
    expect(resumeResponse.body.session.status).toBe("active");

    const approveResponse = await request(app)
      .post("/accounts/me/sessions/demo-session/approve")
      .set(authHeader);
    expect(approveResponse.status).toBe(200);
    expect(approveResponse.body.session.requiresApproval).toBe(false);
  });

  test("prevents non-admin approval", async () => {
    const registerResponse = await request(app)
      .post("/auth/register")
      .send({
        email: "runner@example.com",
        password: "runner-pass",
        displayName: "Runner"
      });

    const token = registerResponse.body.token;
    const authHeader = { Authorization: `Bearer ${token}` };

    await request(app)
      .post("/accounts/me/sessions")
      .set(authHeader)
      .send({
        sessionId: "player-session",
        requiresApproval: true
      });

    const approveResponse = await request(app)
      .post("/accounts/me/sessions/player-session/approve")
      .set(authHeader);

    expect(approveResponse.status).toBe(403);
  });

  test("closes a session and queues the offline pipeline", async () => {
    const registerResponse = await request(app)
      .post("/auth/register")
      .send({
        email: "closer@example.com",
        password: "frontier-close",
        displayName: "Closer"
      });

    const token = registerResponse.body.token;
    const authHeader = { Authorization: `Bearer ${token}` };

    await request(app)
      .post("/accounts/me/sessions")
      .set(authHeader)
      .send({
        sessionId: "closure-session",
        title: "Closure Session"
      });

    const closeResponse = await request(app)
      .post("/sessions/closure-session/close")
      .set(authHeader)
      .send({ reason: "wrap-up" });

    expect(closeResponse.status).toBe(202);
    expect(closeResponse.body.session.status).toBe("closed");
    expect(closeResponse.body.session.offlinePending).toBe(true);
    expect(closeResponse.body.closureJob).toEqual(
      expect.objectContaining({
        jobId: "job-1",
        status: "queued"
      })
    );

    expect(offlineCoordinator.enqueueClosure).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "closure-session",
        reason: "wrap-up",
        auditRef: expect.stringContaining("session.close:closure-session")
      })
    );

    const publishCalls = broadcaster.publish.mock.calls.filter(
      ([sessionId]) => sessionId === "closure-session"
    );
    const eventTypes = publishCalls.map(([, event]) => event.type);
    expect(eventTypes).toEqual(expect.arrayContaining(["session.statusChanged", "session.closed"]));

    const sessionState = sessionMemory.getSessionState("closure-session");
    expect(sessionState.pendingOfflineReconcile).toBe(true);
  });
});
