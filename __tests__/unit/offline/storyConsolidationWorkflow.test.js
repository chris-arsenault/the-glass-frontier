"use strict";

const {
  StoryConsolidationWorkflow
} = require("../../../src/offline/storyConsolidation/storyConsolidationWorkflow");
const {
  InMemorySessionSummaryStore
} = require("../../../src/offline/storyConsolidation/sessionSummaryStore");

function createMetrics() {
  return {
    recordWorkflowStarted: jest.fn(),
    recordWorkflowCompleted: jest.fn(),
    recordWorkflowFailed: jest.fn(),
    recordAttachmentPersisted: jest.fn()
  };
}

describe("StoryConsolidationWorkflow", () => {
  const clock = () => new Date("2025-11-05T10:00:00.000Z");

  test("produces summaries, persists attachments, and publishes summaryReady event", async () => {
    const transcript = [
      {
        turnId: "turn-1",
        sceneId: "scene.arrival",
        actId: "act.one",
        speaker: "gm",
        text: "A glassfall haze blankets the relay hub as couriers scramble between pylons.",
        timestamp: "2025-11-05T08:59:00.000Z",
        metadata: {
          tension: "steady",
          sceneTitle: "Arrival at the Relay",
          tags: ["location.eclipse-relay"],
          hooks: [{ title: "Identify the saboteur", status: "open" }],
          actTitle: "Signals at Dusk"
        }
      },
      {
        turnId: "turn-2",
        sceneId: "scene.arrival",
        actId: "act.one",
        speaker: "player",
        text: "\"I activate the prism scanner and sweep for sabotage residue.\"",
        timestamp: "2025-11-05T09:00:00.000Z",
        metadata: {
          achievements: ["Recovered sabotage residues"],
          assetsGranted: ["sample.prism-residue"],
          highlightQuote: "Scanner report flagged a resonance spike.",
          momentum: { delta: 1, value: 1, reason: "clever investigation" }
        }
      },
      {
        turnId: "turn-3",
        sceneId: "scene.arrival",
        actId: "act.one",
        speaker: "gm",
        text: "Your scanner reveals lattice burns on the relay core; tampering remains fresh.",
        timestamp: "2025-11-05T09:01:00.000Z",
        metadata: {
          tension: "rising",
          safetyFlags: [{ id: "content.warning.violence", severity: "low" }],
          keyMoment: "Confirmed ongoing sabotage."
        }
      },
      {
        turnId: "turn-4",
        sceneId: "scene.reactor",
        actId: "act.two",
        speaker: "gm",
        text: "Descending into the reactor annex, alarms wail as containment fields flicker.",
        timestamp: "2025-11-05T09:05:00.000Z",
        metadata: {
          tension: "crisis",
          sceneTitle: "Containment Breach",
          tags: ["threat.containment", "faction.prismwell-kite-guild"],
          hooks: [{ title: "Stabilise the reactor core", status: "open" }],
          actTitle: "Containment Measures"
        }
      },
      {
        turnId: "turn-5",
        sceneId: "scene.reactor",
        actId: "act.two",
        speaker: "player",
        text: "\"I reroute auxiliary shards to reinforce the containment lattice.\"",
        timestamp: "2025-11-05T09:06:00.000Z",
        metadata: {
          achievements: ["Stabilised containment field"],
          reputationShifts: ["Prismwell Kite Guild: +1 trust"],
          momentum: { delta: 1, value: 2, reason: "decisive action" },
          attachments: [
            {
              type: "application/json",
              name: "containment_snapshot.json",
              metadata: { description: "Sensor snapshot" }
            }
          ]
        }
      }
    ];

    const summaryStore = new InMemorySessionSummaryStore({ clock });
    const eventPublisher = { publish: jest.fn().mockResolvedValue(null) };
    const metrics = createMetrics();

    const attachmentPlanner = {
      plan: jest.fn().mockReturnValue([
        { type: "application/json", name: "containment_snapshot.json" }
      ]),
      persist: jest
        .fn()
        .mockResolvedValue("minio://session-summaries/session-42/containment_snapshot.json")
    };

    const workflow = new StoryConsolidationWorkflow({
      summaryStore,
      eventPublisher,
      metrics,
      attachmentPlanner,
      clock
    });

    const result = await workflow.run({
      sessionId: "session-42",
      transcript,
      sessionMetadata: {
        acts: [
          { actId: "act.one", title: "Signals at Dusk" },
          { actId: "act.two", title: "Containment Measures" }
        ]
      }
    });

    expect(result.sessionId).toBe("session-42");
    expect(result.version).toBe(1);
    expect(result.sceneBreakdown).toHaveLength(2);
    expect(result.sceneBreakdown[0].tension.level).toBe("rising");
    expect(result.sceneBreakdown[1].tension.level).toBe("crisis");
    expect(result.playerHighlights.achievements).toContain("Stabilised containment field");
    expect(result.attachmentsUrl).toBe(
      "minio://session-summaries/session-42/containment_snapshot.json"
    );

    expect(eventPublisher.publish).toHaveBeenCalledWith(
      "intent.storyConsolidation.summaryReady",
      expect.objectContaining({
        sessionId: "session-42",
        sceneCount: 2,
        version: 1
      }),
      expect.objectContaining({
        playerHighlights: expect.any(Object)
      })
    );

    expect(metrics.recordWorkflowStarted).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "session-42" })
    );
    expect(metrics.recordWorkflowCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "session-42", version: 1 })
    );
    expect(metrics.recordAttachmentPersisted).toHaveBeenCalledWith(
      expect.objectContaining({ attachmentCount: 1 })
    );
    expect(metrics.recordWorkflowFailed).not.toHaveBeenCalled();
  });

  test("builds transcript from change feed events and increments version", async () => {
    const store = new InMemorySessionSummaryStore({ clock });
    const eventPublisher = { publish: jest.fn().mockResolvedValue(null) };
    const metrics = createMetrics();

    const workflow = new StoryConsolidationWorkflow({
      summaryStore: store,
      eventPublisher,
      metrics,
      clock
    });

    const events = [
      {
        id: "evt-1",
        type: "transcript.gm.append",
        sequence: 1,
        timestamp: "2025-11-05T11:00:00.000Z",
        payload: {
          sceneId: "scene.bridge",
          actId: "act.one",
          text: "The bridge crew braces as the voidstorm breaches the hull.",
          metadata: { tension: "rising", tags: ["threat.voidstorm"] }
        }
      },
      {
        id: "evt-2",
        type: "transcript.player.append",
        sequence: 2,
        timestamp: "2025-11-05T11:01:00.000Z",
        payload: {
          sceneId: "scene.bridge",
          actId: "act.one",
          text: "\"I order emergency shielding and reroute power to the prism array.\"",
          metadata: {
            momentum: { delta: 1, value: 1 },
            achievements: ["Shielded the command deck"]
          }
        }
      },
      {
        id: "evt-3",
        type: "safety.flagged",
        sequence: 3,
        timestamp: "2025-11-05T11:01:10.000Z",
        payload: {
          flags: ["content.warning.suffocation"],
          severity: "medium",
          description: "Player signalled claustrophobic trigger.",
          sceneId: "scene.bridge",
          turnId: "evt-2"
        }
      }
    ];

    const firstRun = await workflow.run({
      sessionId: "session-99",
      events
    });

    expect(firstRun.version).toBe(1);
    expect(firstRun.safetyNotes).toHaveLength(1);

    const secondRunEvents = events.concat([
      {
        id: "evt-4",
        type: "transcript.gm.append",
        sequence: 4,
        timestamp: "2025-11-05T11:02:00.000Z",
        payload: {
          sceneId: "scene.bridge",
          actId: "act.one",
          text: "Containment holds, but the storm scars the hull.",
          metadata: { tension: "steady" }
        }
      }
    ]);

    const secondRun = await workflow.run({
      sessionId: "session-99",
      events: secondRunEvents
    });

    expect(secondRun.version).toBe(2);
    expect(eventPublisher.publish).toHaveBeenCalledTimes(2);
    expect(secondRun.sceneBreakdown[0].summary).toContain("Containment holds");
  });

  test("throws when no transcript or events are provided", async () => {
    const workflow = new StoryConsolidationWorkflow({
      summaryStore: new InMemorySessionSummaryStore(),
      metrics: createMetrics()
    });

    await expect(
      workflow.run({
        sessionId: "session-missing"
      })
    ).rejects.toThrow("story_consolidation_requires_transcript_or_events");
  });
});
