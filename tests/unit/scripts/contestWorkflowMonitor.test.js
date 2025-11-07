"use strict";

import { buildSummary,
  DEFAULT_THRESHOLDS,
  parseContestEvents
 } from "../../../_scripts_bak/benchmarks/contestWorkflowMonitor.js";

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
    expect(summary.totals.expiredContests).toBe(0);
    expect(summary.durations.arming.samples).toBe(2);
    expect(summary.durations.resolution.samples).toBe(2);
    expect(summary.durations.expiredArming.samples).toBe(0);
    expect(summary.durations.arming.max).toBe(6200);
    expect(summary.durations.resolution.max).toBe(1500);
    expect(summary.durations.resolution.breached).toBe(true);
    expect(summary.participants.samples).toBe(2);
    expect(summary.participants.multiActorContests).toBe(1);
    expect(summary.participants.capacityOverTwo).toBe(1);
    expect(summary.participants.timeouts.samples).toBe(0);
    expect(summary.totals.resolvedContests).toBe(2);
  });

  test("aggregates expired contest telemetry", () => {
    const events = [
      {
        message: "telemetry.contest.expired",
        hubId: "hub-expired",
        roomId: "room-expired",
        contestKey: "verb.challengeDuel::actor-alpha",
        armingDurationMs: 7800,
        participantCount: 1
      },
      {
        message: "telemetry.contest.expired",
        hubId: "hub-expired",
        roomId: "room-expired",
        contestKey: "verb.challengeDuel::actor-beta",
        armingDurationMs: 6200,
        participantCount: 3
      }
    ];

    const summary = buildSummary(events, DEFAULT_THRESHOLDS);

    expect(summary.totals.expiredContests).toBe(2);
    expect(summary.durations.expiredArming.samples).toBe(2);
    expect(summary.durations.expiredArming.p95).toBe(7800);
    expect(summary.participants.timeouts.samples).toBe(2);
    expect(summary.participants.timeouts.multiActorContests).toBe(1);
  });

  test("collects sentiment telemetry samples", () => {
    const events = [
      {
        message: "telemetry.contest.sentiment",
        hubId: "hub-alpha",
        roomId: "room-1",
        contestId: "contest-1",
        sentiment: "negative",
        tone: "aggressive",
        phase: "cooldown",
        remainingCooldownMs: 3200,
        cooldownMs: 6000,
        issuedAt: 1700000000000
      },
      {
        message: "telemetry.contest.sentiment",
        hubId: "hub-alpha",
        roomId: "room-1",
        contestId: "contest-1",
        sentiment: "positive",
        tone: "relieved",
        phase: "post-cooldown",
        remainingCooldownMs: 0,
        cooldownMs: 6000,
        issuedAt: 1700001000000
      },
      {
        message: "telemetry.contest.sentiment",
        hubId: "hub-beta",
        roomId: "room-2",
        contestId: "contest-2",
        sentiment: "neutral",
        tone: "calm",
        phase: "cooldown",
        remainingCooldownMs: 1800,
        cooldownMs: 5000,
        issuedAt: 1699999000000
      }
    ];

    const summary = buildSummary(events, DEFAULT_THRESHOLDS);
    expect(summary.sentiment.samples).toBe(3);
    expect(summary.sentiment.totals.negative).toBe(1);
    expect(summary.sentiment.totals.positive).toBe(1);
    expect(summary.sentiment.totals.neutral).toBe(1);
    expect(summary.sentiment.cooldown.activeSamples).toBe(2);
    expect(summary.sentiment.cooldown.negativeDuringCooldown).toBe(1);
    expect(summary.sentiment.hotspots[0]).toEqual(
      expect.objectContaining({
        hubId: "hub-alpha",
        roomId: "room-1"
      })
    );
    expect(summary.sentiment.latest[0].sentiment).toBe("positive");
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
        },
        {
          type: "telemetry.hub.contestExpired",
          payload: {
            hubId: "hub-timeline",
            roomId: "room-timeline",
            contestKey: "contest-key",
            armingDurationMs: 6000,
            participantCount: 1
          }
        },
        {
          type: "telemetry.hub.contestSentiment",
          payload: {
            hubId: "hub-timeline",
            roomId: "room-timeline",
            contestId: "contest-timeline",
            contestKey: "contest-key",
            actorId: "actor-beta",
            sentiment: "negative",
            tone: "frustrated",
            phase: "cooldown",
            remainingCooldownMs: 4200,
            cooldownMs: 6000,
            messageLength: 48,
            issuedAt: 1700000000000
          }
        }
      ]
    };

    const events = parseContestEvents(JSON.stringify(timeline));
    expect(events).toHaveLength(5);
    expect(events[0].message).toBe("telemetry.contest.armed");
    expect(events[1].participantCapacity).toBe(4);
    expect(events[2].outcomeTier).toBe("success");
    expect(events[3].message).toBe("telemetry.contest.expired");
    const sentimentEvent = events[4];
    expect(sentimentEvent.message).toBe("telemetry.contest.sentiment");
    expect(sentimentEvent.sentiment).toBe("negative");
    expect(sentimentEvent.remainingCooldownMs).toBe(4200);
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
