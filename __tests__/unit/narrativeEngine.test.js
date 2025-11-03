"use strict";

const { NarrativeEngine } = require("../../src/narrative/narrativeEngine");
const { SessionMemoryFacade } = require("../../src/memory/sessionMemory");
const { CheckBus } = require("../../src/events/checkBus");
const { SessionTelemetry } = require("../../src/narrative/langGraph/telemetry");

function createTelemetrySpy() {
  const events = [];
  const emitter = (level, message, metadata) => {
    events.push({ level, message, metadata });
  };
  return {
    telemetry: new SessionTelemetry({ emitter }),
    events
  };
}

describe("NarrativeEngine · LangGraph orchestration", () => {
  let sessionMemory;
  let checkBus;

  beforeEach(() => {
    sessionMemory = new SessionMemoryFacade();
    checkBus = new CheckBus();
  });

  test("emits a production check request with telemetry when intent suggests a roll", async () => {
    const { telemetry, events } = createTelemetrySpy();
    const engine = new NarrativeEngine({ sessionMemory, checkBus, telemetry });
    const checkEvents = [];
    checkBus.onCheckRequest((envelope) => checkEvents.push(envelope));

    const result = await engine.handlePlayerMessage({
      sessionId: "session-123",
      playerId: "player-1",
      content: "I sneak past the guards and risk a roll."
    });

    expect(result.checkRequest).toBeTruthy();
    expect(result.checkRequest.trigger.detectedMove).toBe("delve-the-ruins");
    expect(result.checkRequest.data.move).toBe("delve-the-ruins");
    expect(result.checkRequest.metadata.promptHash).toHaveLength(64);
    expect(checkEvents).toHaveLength(1);
    expect(checkEvents[0].sessionId).toBe("session-123");
    expect(
      events.filter(
        (entry) => entry.message === "telemetry.session.transition" && entry.metadata.status === "success"
      )
    ).toHaveLength(5);
    expect(events.some((entry) => entry.message === "telemetry.session.check-dispatch")).toBe(true);
  });

  test("retains purely narrative flow without dispatching a check", async () => {
    const { telemetry, events } = createTelemetrySpy();
    const engine = new NarrativeEngine({ sessionMemory, checkBus, telemetry });
    const checkEvents = [];
    checkBus.onCheckRequest((envelope) => checkEvents.push(envelope));

    const result = await engine.handlePlayerMessage({
      sessionId: "session-456",
      playerId: "player-2",
      content: "I recall the legends carved into the relay walls."
    });

    expect(result.checkRequest).toBeNull();
    expect(result.narrativeEvent.content).toContain("relay");
    expect(result.narrativeEvent.markers.find((marker) => marker.marker === "narrative-beat")).toBeTruthy();
    expect(checkEvents).toHaveLength(0);
    expect(events.some((entry) => entry.message === "telemetry.session.check-dispatch")).toBe(false);
  });

  test("escalates safety concerns to moderation with telemetry", async () => {
    const { telemetry, events } = createTelemetrySpy();
    const engine = new NarrativeEngine({ sessionMemory, checkBus, telemetry });
    const adminAlerts = [];
    checkBus.onAdminAlert((envelope) => adminAlerts.push(envelope));

    const result = await engine.handlePlayerMessage({
      sessionId: "session-999",
      playerId: "player-9",
      content: "I attempt to rewrite history with forbidden time travel."
    });

    expect(result.checkRequest).toBeNull();
    expect(result.safety.escalate).toBe(true);
    expect(adminAlerts).toHaveLength(1);
    expect(adminAlerts[0].reason).toBe("safety_gate_triggered");
    expect(events.some((entry) => entry.message === "telemetry.session.safety")).toBe(true);
  });

  test("records check resolution via bus event", () => {
    const { telemetry } = createTelemetrySpy();
    const engine = new NarrativeEngine({ sessionMemory, checkBus, telemetry });

    const envelope = {
      id: "check-1",
      sessionId: "session-789",
      auditRef: "audit:test",
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
