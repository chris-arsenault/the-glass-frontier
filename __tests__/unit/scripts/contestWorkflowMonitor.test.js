"use strict";

const {
  buildSummary,
  DEFAULT_THRESHOLDS,
  parseContestEvents
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
    expect(summary.totals.resolvedContests).toBe(2);
  });
});

describe("contestWorkflowMonitor parseContestEvents", () => {
  test("parses NDJSON log lines with telemetry messages", () => {
    const raw = [
      JSON.stringify({
        message: "telemetry.contest.launched",
        contestId: "contest-ndjson",
        armingDurationMs: 420,
        participantCount: 2
      }),
      JSON.stringify({
        message: "telemetry.contest.resolved",
        contestId: "contest-ndjson",
        resolutionDurationMs: 610,
        participantCount: 2
      })
    ].join("\n");

    const events = parseContestEvents(raw);
    expect(events).toHaveLength(2);
    expect(events[0].message).toBe("telemetry.contest.launched");
    expect(events[1].message).toBe("telemetry.contest.resolved");
  });

  test("parses timeline artefacts into telemetry events", () => {
    const timeline = {
      hubId: "hub-timeline",
      roomId: "room-timeline",
      contestId: "contest-timeline",
      timeline: [
        {
          type: "telemetry.hub.contestArmed",
          payload: {
            hubId: "hub-timeline",
            roomId: "room-timeline",
            contestKey: "contest-key",
            participantCount: 1
          }
        },
        {
          type: "telemetry.hub.contestLaunched",
          payload: {
            hubId: "hub-timeline",
            roomId: "room-timeline",
            contestId: "contest-timeline",
            participantCount: 2,
            participantCapacity: 4,
            armingDurationMs: 580
          }
        },
        {
          type: "telemetry.hub.contestResolved",
          payload: {
            hubId: "hub-timeline",
            roomId: "room-timeline",
            contestId: "contest-timeline",
            resolutionDurationMs: 420,
            outcomeTier: "success"
          }
        }
      ]
    };

    const events = parseContestEvents(JSON.stringify(timeline));
    expect(events).toHaveLength(3);
    expect(events[0].message).toBe("telemetry.contest.armed");
    expect(events[1].participantCapacity).toBe(4);
    expect(events[2].outcomeTier).toBe("success");
  });

  test("parses CLI summary artefacts back into telemetry events", () => {
    const summary = {
      totals: {
        contestsObserved: 1,
        resolvedContests: 1,
        workflowFailures: 1
      },
      raw: {
        contests: [
          {
            contestId: "contest-summary",
            hubId: "hub-summary",
            roomId: "room-summary",
            armingDurationMs: 420,
            resolutionDurationMs: 600,
            participantCount: 3,
            participantCapacity: 4,
            outcomes: ["partial"]
          }
        ],
        workflowFailures: [
          {
            contestId: "contest-summary",
            hubId: "hub-summary",
            roomId: "room-summary",
            error: "timeout"
          }
        ]
      }
    };

    const events = parseContestEvents(JSON.stringify(summary));
    expect(events).toHaveLength(3);
    expect(events.filter((event) => event.message === "telemetry.contest.resolved")).toHaveLength(1);
    expect(events.find((event) => event.message === "telemetry.contest.resolved").resolutionDurationMs).toBe(600);
    expect(events.find((event) => event.message === "telemetry.contest.workflowFailed")).toBeTruthy();
  });
});
