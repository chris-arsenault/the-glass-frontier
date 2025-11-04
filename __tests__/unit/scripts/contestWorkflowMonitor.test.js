"use strict";

const {
  buildSummary,
  DEFAULT_THRESHOLDS
} = require("../../../scripts/benchmarks/contestWorkflowMonitor");

describe("contestWorkflowMonitor buildSummary", () => {
  test("aggregates contest metrics and flags budget breaches", () => {
    const events = [
      {
        message: "telemetry.contest.launched",
        contestId: "contest-1",
        hubId: "hub-a",
        roomId: "room-1",
        armingDurationMs: 320,
        participantCount: 2,
        participantCapacity: 2
      },
      {
        message: "telemetry.contest.resolved",
        contestId: "contest-1",
        resolutionDurationMs: 540,
        armingDurationMs: 330,
        participantCount: 2
      },
      {
        message: "telemetry.contest.launched",
        contestId: "contest-2",
        hubId: "hub-a",
        roomId: "room-2",
        armingDurationMs: 6100,
        participantCount: 4,
        participantCapacity: 4
      },
      {
        message: "telemetry.contest.resolved",
        contestId: "contest-2",
        resolutionDurationMs: 1500,
        armingDurationMs: 6200,
        participantCount: 4,
        participantCapacity: 4,
        outcomeTier: "miss"
      },
      {
        message: "telemetry.contest.workflowFailed",
        contestId: "contest-3",
        hubId: "hub-a",
        roomId: "room-3",
        error: "timeout"
      }
    ];

    const summary = buildSummary(events, DEFAULT_THRESHOLDS);

    expect(summary.totals.contestsObserved).toBe(2);
    expect(summary.totals.workflowFailures).toBe(1);
    expect(summary.durations.arming.samples).toBe(2);
    expect(summary.durations.resolution.samples).toBe(2);
    expect(summary.durations.arming.max).toBe(6200);
    expect(summary.durations.resolution.max).toBe(1500);
    expect(summary.durations.resolution.breached).toBe(true);
    expect(summary.participants.samples).toBe(2);
    expect(summary.participants.multiActorContests).toBe(1);
    expect(summary.participants.capacityOverTwo).toBe(1);
  });
});

