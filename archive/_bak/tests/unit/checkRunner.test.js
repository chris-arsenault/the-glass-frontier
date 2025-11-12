"use strict";

import { CheckBus,
  CHECK_RESOLVED_TOPIC,
  CHECK_VETOED_TOPIC
 } from "../../_src_bak/events/checkBus.js";
import { SessionMemoryFacade  } from "../../_src_bak/memory/sessionMemory.js";
import { CheckRunner  } from "../../_src_bak/checkRunner/checkRunner.js";
import { NarrativeEngine  } from "../../_src_bak/narrative/narrativeEngine.js";
import { createStubLlmClient  } from "../helpers/createStubLlmClient.js";

function createRandomizer(values) {
  return jest.fn((_seed, count) => values.slice(0, count));
}

function createCheckPayload(overrides = {}) {
  return {
    data: {
      playerId: "player-1",
      sessionId: overrides.sessionId || "session-test",
      move: overrides.move || "test-move",
      ability: overrides.ability || "finesse",
      difficulty: overrides.difficulty || "standard",
      difficultyValue: overrides.difficultyValue ?? 8,
      momentum: overrides.momentum ?? 0,
      rationale: overrides.rationale || "Test check rationale.",
      flags: overrides.flags || [],
      safetyFlags: overrides.safetyFlags || [],
      mechanics: {
        statValue: overrides.statValue ?? 2,
        bonusDice: overrides.bonusDice ?? 0
      },
      tags: overrides.tags || []
    }
  };
}

describe("CheckRunner", () => {
  let sessionMemory;
  let checkBus;
  let telemetry;
  let narrativeEngine;

  beforeEach(() => {
    sessionMemory = new SessionMemoryFacade();
    checkBus = new CheckBus();
    telemetry = {
      recordCheckRun: jest.fn(),
      recordCheckVeto: jest.fn(),
      recordCheckError: jest.fn()
    };
    narrativeEngine = new NarrativeEngine({
      sessionMemory,
      checkBus,
      llmClient: createStubLlmClient()
    });
  });

  function startRunnerWithRandomizer(randomizer) {
    const runner = new CheckRunner({
      checkBus,
      sessionMemory,
      telemetry,
      randomizer
    });
    runner.start();
    return runner;
  }

  async function emitAndCapture(sessionId, payloadBuilder) {
    return new Promise((resolve) => {
      const handler = (envelope) => {
        if (envelope.sessionId !== sessionId) {
          return;
        }

        checkBus.off(CHECK_RESOLVED_TOPIC, handler);
        resolve(envelope);
      };

      checkBus.on(CHECK_RESOLVED_TOPIC, handler);
      const payload = payloadBuilder();
      checkBus.emitCheckRequest(sessionId, payload);
    });
  }

  test("resolves a critical success and boosts momentum", async () => {
    const sessionId = "session-critical";
    sessionMemory.ensureSession(sessionId);
    startRunnerWithRandomizer(createRandomizer([6, 6]));

    const envelope = await emitAndCapture(sessionId, () =>
      createCheckPayload({ sessionId, statValue: 2 })
    );

    expect(envelope.tier).toBe("critical-success");
    expect(telemetry.recordCheckRun).toHaveBeenCalledWith(expect.objectContaining({ tier: "critical-success" }));
    const state = sessionMemory.getSessionState(sessionId);
    expect(state.momentum.current).toBe(2);
    expect(state.character.stats.finesse).toBe(3);
  });

  test("resolves a full success without momentum reset", async () => {
    const sessionId = "session-full";
    sessionMemory.ensureSession(sessionId);
    startRunnerWithRandomizer(createRandomizer([4, 3]));

    const envelope = await emitAndCapture(sessionId, () =>
      createCheckPayload({ sessionId, statValue: 2 })
    );

    expect(envelope.tier).toBe("full-success");
    const state = sessionMemory.getSessionState(sessionId);
    expect(state.momentum.current).toBe(1);
  });

  test("resolves a partial success with no momentum change", async () => {
    const sessionId = "session-partial";
    sessionMemory.ensureSession(sessionId);
    startRunnerWithRandomizer(createRandomizer([3, 2]));

    const envelope = await emitAndCapture(sessionId, () =>
      createCheckPayload({ sessionId, statValue: 2 })
    );

    expect(envelope.tier).toBe("partial-success");
    const state = sessionMemory.getSessionState(sessionId);
    expect(state.momentum.current).toBe(0);
  });

  test("resolves a fail-forward and drops momentum", async () => {
    const sessionId = "session-fail-forward";
    sessionMemory.ensureSession(sessionId);
    startRunnerWithRandomizer(createRandomizer([2, 2]));

    const envelope = await emitAndCapture(sessionId, () =>
      createCheckPayload({ sessionId, statValue: 1 })
    );

    expect(envelope.tier).toBe("fail-forward");
    const state = sessionMemory.getSessionState(sessionId);
    expect(state.momentum.current).toBe(-1);
  });

  test("resolves a hard miss and resets momentum baseline", async () => {
    const sessionId = "session-hard-miss";
    sessionMemory.ensureSession(sessionId);
    const state = sessionMemory.getSessionState(sessionId);
    state.momentum.current = 2;
    startRunnerWithRandomizer(createRandomizer([1, 1]));

    const envelope = await emitAndCapture(sessionId, () =>
      createCheckPayload({ sessionId, statValue: 0 })
    );

    expect(envelope.tier).toBe("hard-miss");
    expect(envelope.momentum.after).toBe(0);
    const updated = sessionMemory.getSessionState(sessionId);
    expect(updated.momentum.current).toBe(0);
    expect(updated.character.stats.finesse).toBe(1);
  });

  test("emits veto and admin alert when safety flags block the check", () =>
    new Promise((resolve, reject) => {
      const sessionId = "session-safety";
      sessionMemory.ensureSession(sessionId);
      startRunnerWithRandomizer(createRandomizer([6, 6]));

      const vetoHandler = (envelope) => {
        checkBus.off(CHECK_VETOED_TOPIC, vetoHandler);
        setImmediate(() => {
          try {
            expect(envelope.reason).toBe("prohibited-capability");
            expect(telemetry.recordCheckVeto).toHaveBeenCalled();
            const state = sessionMemory.getSessionState(sessionId);
            expect(state.vetoedChecks).toHaveLength(1);
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      };

      checkBus.on(CHECK_VETOED_TOPIC, vetoHandler);
      checkBus.emitCheckRequest(
        sessionId,
        createCheckPayload({
          sessionId,
          safetyFlags: ["prohibited-capability"]
        })
      );
    }));
});
