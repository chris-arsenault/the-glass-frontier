"use strict";

const request = require("supertest");
const { createApp } = require("../../src/server/app");
const { NarrativeEngine } = require("../../src/narrative/narrativeEngine");
const { SessionMemoryFacade } = require("../../src/memory/sessionMemory");
const { CheckBus } = require("../../src/events/checkBus");

describe("Narrative Engine HTTP API", () => {
  let sessionMemory;
  let checkBus;
  let narrativeEngine;
  let broadcaster;
  let app;

  beforeEach(() => {
    sessionMemory = new SessionMemoryFacade();
    checkBus = new CheckBus();
    narrativeEngine = new NarrativeEngine({ sessionMemory, checkBus });
    broadcaster = { publish: jest.fn() };
    app = createApp({ narrativeEngine, checkBus, broadcaster });
  });

  test("returns narrative event for player message and triggers broadcast", async () => {
    const response = await request(app)
      .post("/sessions/test-session/messages")
      .send({
        playerId: "player-1",
        content: "I sneak through the corridor"
      });

    expect(response.status).toBe(202);
    expect(response.body.narrativeEvent).toBeDefined();
    expect(broadcaster.publish).toHaveBeenCalledWith(
      "test-session",
      expect.objectContaining({ type: "session.message" })
    );
  });

  test("records check resolution via API", async () => {
    const result = await request(app)
      .post("/sessions/test-session/checks/check-123/resolve")
      .send({
        result: "success",
        outcome: "partial",
        rationale: "Quick thinking saved the day.",
        momentumDelta: 1
      });

    expect(result.status).toBe(202);
    const state = sessionMemory.getSessionState("test-session");
    expect(state.resolvedChecks).toHaveLength(1);
    expect(state.resolvedChecks[0].result).toBe("success");
  });
});
