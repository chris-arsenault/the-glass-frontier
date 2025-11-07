"use strict";

import request from "supertest";
import { createApp  } from "../../_src_bak/server/app.js";
import { NarrativeEngine  } from "../../_src_bak/narrative/narrativeEngine.js";
import { SessionMemoryFacade  } from "../../_src_bak/memory/sessionMemory.js";
import { CheckBus  } from "../../_src_bak/events/checkBus.js";
import { CheckRunner  } from "../../_src_bak/checkRunner/checkRunner.js";
import { createStubLlmClient  } from "../helpers/createStubLlmClient.js";

describe("Narrative Engine HTTP API", () => {
  let sessionMemory;
  let checkBus;
  let narrativeEngine;
  let broadcaster;
  let app;
  let checkRunner;

  beforeEach(() => {
    sessionMemory = new SessionMemoryFacade();
    checkBus = new CheckBus();
    narrativeEngine = new NarrativeEngine({
      sessionMemory,
      checkBus,
      llmClient: createStubLlmClient()
    });
    checkRunner = new CheckRunner({
      checkBus,
      sessionMemory,
      telemetry: {
        recordCheckRun: jest.fn(),
        recordCheckVeto: jest.fn(),
        recordCheckError: jest.fn()
      }
    });
    checkRunner.start();
    broadcaster = { publish: jest.fn() };
    app = createApp({ narrativeEngine, checkBus, broadcaster, sessionMemory });
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
        tier: "full-success",
        outcome: "full-success",
        rationale: "Quick thinking saved the day.",
        momentumDelta: 1,
        flags: [],
        safetyFlags: []
      });

    expect(result.status).toBe(202);
    const state = sessionMemory.getSessionState("test-session");
    expect(state.resolvedChecks).toHaveLength(1);
    expect(state.resolvedChecks[0].result).toBe("full-success");
    expect(state.momentum.current).toBe(1);
  });
});
