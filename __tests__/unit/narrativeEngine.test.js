"use strict";

const { NarrativeEngine } = require("../../src/narrative/narrativeEngine");
const { SessionMemoryFacade } = require("../../src/memory/sessionMemory");
const { CheckBus } = require("../../src/events/checkBus");

describe("NarrativeEngine", () => {
  let sessionMemory;
  let checkBus;
  let engine;

  beforeEach(() => {
    sessionMemory = new SessionMemoryFacade();
    checkBus = new CheckBus();
    engine = new NarrativeEngine({ sessionMemory, checkBus });
  });

  test("generates a check request when intent indicates a roll", async () => {
    const captured = [];
    checkBus.onCheckRequest((envelope) => captured.push(envelope));

    const result = await engine.handlePlayerMessage({
      sessionId: "session-123",
      playerId: "player-1",
      content: "I sneak past the guards and roll for it."
    });

    expect(result.checkRequest).toBeTruthy();
    expect(result.checkRequest.data.move).toBe("stealth");
    expect(captured).toHaveLength(1);
    expect(captured[0].sessionId).toBe("session-123");
  });

  test("does not emit a check request for narrative-only input", async () => {
    const captured = [];
    checkBus.onCheckRequest((envelope) => captured.push(envelope));

    const result = await engine.handlePlayerMessage({
      sessionId: "session-456",
      playerId: "player-2",
      content: "I recall the legends carved into the relay walls."
    });

    expect(result.checkRequest).toBeNull();
    expect(result.narrativeEvent.content).toContain("relay hall hums");
    expect(captured).toHaveLength(0);
  });

  test("records check resolution via bus event", () => {
    const envelope = {
      id: "check-1",
      sessionId: "session-789",
      result: "full",
      outcome: "success",
      rationale: "Stealth succeeded."
    };

    checkBus.emitCheckResolved(envelope);
    const state = sessionMemory.getSessionState("session-789");

    expect(state.resolvedChecks).toHaveLength(1);
    expect(state.resolvedChecks[0].result).toBe("full");
  });
});
