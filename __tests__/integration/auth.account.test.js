"use strict";

const request = require("supertest");
const { createApp } = require("../../src/server/app");
const { NarrativeEngine } = require("../../src/narrative/narrativeEngine");
const { SessionMemoryFacade } = require("../../src/memory/sessionMemory");
const { CheckBus } = require("../../src/events/checkBus");

describe("Account & auth API", () => {
  let app;
  let sessionMemory;
  let checkBus;
  let narrativeEngine;
  let broadcaster;

  beforeEach(() => {
    sessionMemory = new SessionMemoryFacade();
    checkBus = new CheckBus();
    narrativeEngine = new NarrativeEngine({ sessionMemory, checkBus });
    broadcaster = {
      publish: jest.fn(),
      registerStream: jest.fn()
    };

    app = createApp({
      narrativeEngine,
      checkBus,
      broadcaster,
      sessionMemory,
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
});
