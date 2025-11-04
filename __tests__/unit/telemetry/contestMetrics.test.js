"use strict";

const { ContestMetrics } = require("../../../src/telemetry/contestMetrics");

describe("ContestMetrics", () => {
  test("tracks contest lifecycle durations and emits structured logs", () => {
    const logs = [];
    const logger = (level, message, metadata = {}) => {
      logs.push({ level, message, ...metadata });
    };

    const fakeClock = {
      now: jest.fn(() => 0)
    };

    const metrics = new ContestMetrics({ clock: fakeClock, logger });

    metrics.recordArmed({
      hubId: "hub-1",
      roomId: "room-a",
      contestKey: "verb.sparringMatch::alpha",
      participantCount: 1,
      participantCapacity: 4,
      createdAt: 100,
      expiresAt: 900,
      label: "Sparring Match",
      move: "train-hard",
      type: "sparring"
    });

    metrics.recordLaunched({
      hubId: "hub-1",
      roomId: "room-a",
      contestId: "contest-123",
      contestKey: "verb.sparringMatch::alpha",
      participantCount: 3,
      participantCapacity: 4,
      createdAt: 100,
      startedAt: 340,
      label: "Sparring Match",
      move: "train-hard",
      type: "sparring"
    });

    metrics.recordWorkflowStarted({
      hubId: "hub-1",
      roomId: "room-a",
      contestId: "contest-123",
      contestKey: "verb.sparringMatch::alpha",
      workflowId: "wf-987",
      runId: "run-42"
    });

    metrics.recordResolved({
      hubId: "hub-1",
      roomId: "room-a",
      contestId: "contest-123",
      contestKey: "verb.sparringMatch::alpha",
      outcome: { tier: "major-success" },
      resolvedAt: 920,
      startedAt: 340,
      createdAt: 100,
      participantCount: 3,
      participantCapacity: 4,
      sharedComplicationCount: 2
    });

    const armedLog = logs.find((entry) => entry.message === "telemetry.contest.armed");
    expect(armedLog).toMatchObject({
      hubId: "hub-1",
      roomId: "room-a",
      contestKey: "verb.sparringMatch::alpha",
      participantCount: 1,
      participantCapacity: 4,
      label: "Sparring Match"
    });

    const launchedLog = logs.find((entry) => entry.message === "telemetry.contest.launched");
    expect(launchedLog).toMatchObject({
      contestId: "contest-123",
      participantCount: 3,
      participantCapacity: 4,
      armingDurationMs: 240
    });

    const resolvedLog = logs.find((entry) => entry.message === "telemetry.contest.resolved");
    expect(resolvedLog).toMatchObject({
      contestId: "contest-123",
      participantCount: 3,
      participantCapacity: 4,
      outcomeTier: "major-success",
      armingDurationMs: 240,
      resolutionDurationMs: 580,
      sharedComplicationCount: 2
    });

    expect(metrics.activeById.size).toBe(0);
  });
});

