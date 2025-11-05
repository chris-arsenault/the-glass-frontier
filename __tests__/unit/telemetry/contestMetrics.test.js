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

  test("records expired contests with derived arming duration", () => {
    const logs = [];
    const logger = (level, message, metadata = {}) => {
      logs.push({ level, message, ...metadata });
    };

    let currentTime = 0;
    const clock = {
      now: jest.fn(() => currentTime)
    };

    const metrics = new ContestMetrics({ clock, logger });

    metrics.recordArmed({
      hubId: "hub-1",
      roomId: "room-a",
      contestKey: "verb.sparringMatch::alpha",
      participantCount: 1,
      participantCapacity: 4,
      createdAt: 100,
      expiresAt: 700,
      label: "Sparring Match",
      move: "train-hard",
      type: "sparring"
    });

    currentTime = 900;
    metrics.recordExpired({
      hubId: "hub-1",
      roomId: "room-a",
      contestKey: "verb.sparringMatch::alpha",
      expiredAt: 900,
      createdAt: 100,
      participantCount: 1,
      participantCapacity: 4,
      windowMs: 600,
      label: "Sparring Match",
      move: "train-hard",
      type: "sparring"
    });

    const expiredLog = logs.find((entry) => entry.message === "telemetry.contest.expired");
    expect(expiredLog).toMatchObject({
      hubId: "hub-1",
      roomId: "room-a",
      contestKey: "verb.sparringMatch::alpha",
      armingDurationMs: 800,
      windowMs: 600
    });
    expect(metrics.pendingByKey.size).toBe(0);
  });

  test("records rematch cooling, block attempts, and sentiment samples", () => {
    const logs = [];
    const logger = (level, message, metadata = {}) => {
      logs.push({ level, message, ...metadata });
    };

    const metrics = new ContestMetrics({ logger });

    metrics.recordRematchCooling({
      hubId: "hub-1",
      roomId: "room-c",
      contestKey: "verb.sparringMatch::alpha",
      cooldownMs: 12000,
      availableAt: 18000,
      expiredAt: 6000,
      participantCount: 2,
      severity: "moderate",
      missingParticipants: 1
    });

    metrics.recordRematchBlocked({
      hubId: "hub-1",
      roomId: "room-c",
      contestKey: "verb.sparringMatch::alpha",
      actorId: "actor-alpha",
      remainingMs: 8000,
      cooldownMs: 12000
    });

    metrics.recordSentimentSample({
      hubId: "hub-1",
      roomId: "room-c",
      contestKey: "verb.sparringMatch::alpha",
      actorId: "actor-beta",
      sentiment: "negative",
      tone: "aggressive",
      phase: "cooldown",
      messageLength: 32,
      remainingCooldownMs: 4000,
      cooldownMs: 12000,
      issuedAt: 9000
    });

    metrics.recordTimingFallback({
      hubId: "hub-1",
      roomId: "room-c",
      contestId: "contest-123",
      timings: {
        startedAt: 8200,
        resolvedAt: 8700,
        resolutionDurationMs: 500
      }
    });

    const coolingLog = logs.find(
      (entry) => entry.message === "telemetry.contest.rematchCooling"
    );
    expect(coolingLog).toMatchObject({
      cooldownMs: 12000,
      severity: "moderate",
      participantCount: 2,
      missingParticipants: 1
    });

    const blockedLog = logs.find(
      (entry) => entry.message === "telemetry.contest.rematchBlocked"
    );
    expect(blockedLog).toMatchObject({
      actorId: "actor-alpha",
      remainingMs: 8000,
      cooldownMs: 12000
    });

    const sentimentLog = logs.find(
      (entry) => entry.message === "telemetry.contest.sentiment"
    );
    expect(sentimentLog).toMatchObject({
      sentiment: "negative",
      tone: "aggressive",
      phase: "cooldown",
      messageLength: 32,
      remainingCooldownMs: 4000
    });

    const timingLog = logs.find(
      (entry) => entry.message === "telemetry.contest.timingFallback"
    );
    expect(timingLog).toMatchObject({
      contestId: "contest-123",
      timings: expect.objectContaining({
        resolutionDurationMs: 500
      })
    });
  });
});
