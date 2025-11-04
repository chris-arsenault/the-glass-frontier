"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { ModerationService } = require("../../../src/moderation/moderationService");
const { SessionMemoryFacade } = require("../../../src/memory/sessionMemory");
const { CheckBus } = require("../../../src/events/checkBus");

describe("ModerationService", () => {
  let sessionMemory;
  let checkBus;
  let moderation;
  let tempDir;

  beforeEach(() => {
    sessionMemory = new SessionMemoryFacade();
    checkBus = new CheckBus();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "moderation-service-"));
    moderation = new ModerationService({
      sessionMemory,
      checkBus,
      contestLogDirectory: tempDir,
      clock: () => new Date("2025-11-04T08:00:00Z")
    });
  });

  afterEach(() => {
    if (moderation?.destroy) {
      moderation.destroy();
    }
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("records admin alerts and lists them", () => {
    const envelope = checkBus.emitAdminAlert({
      sessionId: "session-alert-1",
      severity: "high",
      reason: "safety_violation",
      data: {
        hubId: "hub-alpha",
        safetyFlags: ["prohibited-capability"]
      }
    });

    const alerts = moderation.listAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].id).toBe(envelope.id);
    expect(alerts[0].status).toBe("live");
    expect(alerts[0].data.safetyFlags).toContain("prohibited-capability");

    const state = sessionMemory.getModerationState("session-alert-1");
    expect(state.alerts).toHaveLength(1);
    expect(state.alerts[0].id).toBe(envelope.id);
  });

  test("applies decisions and emits moderation events", () => {
    const envelope = checkBus.emitAdminAlert({
      sessionId: "session-decision-1",
      severity: "medium",
      reason: "offline.workflow_failed",
      data: {
        jobId: "job-42"
      }
    });

    const spy = jest.spyOn(checkBus, "emitModerationDecision");
    const updated = moderation.applyDecision(
      envelope.id,
      {
        action: "approve",
        notes: "workflow cleared"
      },
      {
        id: "moderator-1",
        displayName: "Moderator One",
        roles: ["moderator"]
      }
    );

    expect(updated.status).toBe("resolved");
    expect(updated.decisions).toHaveLength(1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatchObject({
      alertId: envelope.id,
      action: "approve",
      status: "resolved"
    });

    const moderationState = sessionMemory.getModerationState("session-decision-1");
    expect(moderationState.stats.resolved).toBe(1);
  });

  test("updates moderation queue state and cadence overview after decisions", () => {
    const sessionId = "session-queue-1";
    const deltaId = "delta-queue-1";
    sessionMemory.recordModerationQueue(sessionId, {
      generatedAt: "2025-11-04T08:00:00.000Z",
      pendingCount: 1,
      items: [
        {
          deltaId,
          sessionId,
          status: "needs-review",
          blocking: true,
          reasons: ["capability_violation"],
          deadlineAt: "2025-11-04T08:45:00.000Z",
          countdownMs: 2700000
        }
      ],
      window: {
        status: "awaiting_review",
        startAt: "2025-11-04T08:15:00.000Z",
        endAt: "2025-11-04T08:45:00.000Z",
        escalations: []
      },
      cadence: {
        nextBatchAt: "2025-11-04T09:00:00.000Z",
        nextDigestAt: "2025-11-05T02:00:00.000Z",
        batches: [],
        digest: null
      }
    });

    const envelope = checkBus.emitAdminAlert({
      sessionId,
      severity: "high",
      reason: "world_delta_requires_moderation",
      data: {
        deltaId
      }
    });

    moderation.applyDecision(
      envelope.id,
      {
        action: "approve",
        notes: "Delta cleared"
      },
      {
        id: "moderator-2",
        displayName: "Moderator Two",
        roles: ["moderator"]
      }
    );

    const moderationState = sessionMemory.getModerationState(sessionId);
    expect(moderationState.queue.pendingCount).toBe(0);
    expect(moderationState.queue.items[0]).toEqual(
      expect.objectContaining({
        deltaId,
        status: "resolved",
        blocking: false,
        moderationDecisionId: expect.any(String),
        resolvedAt: expect.any(String)
      })
    );

    const overview = moderation.listCadenceOverview();
    const entry = overview.find((session) => session.sessionId === sessionId);
    expect(entry).toBeDefined();
    expect(entry.queue.pendingCount).toBe(0);
    expect(entry.queue.items[0].status).toBe("resolved");
  });

  test("loads contest summaries from timeline artefacts", () => {
    const timeline = {
      hubId: "hub-moderation",
      roomId: "room-moderation",
      contestId: "contest-123",
      timeline: [
        {
          type: "telemetry.hub.contestArmed",
          payload: {
            hubId: "hub-moderation",
            roomId: "room-moderation",
            contestKey: "verb.sparringMatch:alpha::beta",
            participantCount: 2,
            participantCapacity: 2
          }
        },
        {
          type: "telemetry.hub.contestLaunched",
          payload: {
            hubId: "hub-moderation",
            roomId: "room-moderation",
            contestId: "contest-123",
            contestKey: "verb.sparringMatch:alpha::beta",
            participantCount: 2,
            participantCapacity: 3,
            armingDurationMs: 500
          }
        },
        {
          type: "telemetry.hub.contestResolved",
          payload: {
            hubId: "hub-moderation",
            roomId: "room-moderation",
            contestId: "contest-123",
            contestKey: "verb.sparringMatch:alpha::beta",
            participantCount: 2,
            participantCapacity: 3,
            resolutionDurationMs: 420,
            outcomeTier: "success"
          }
        }
      ]
    };

    const artefactPath = path.join(tempDir, "contest-moderation.json");
    fs.writeFileSync(artefactPath, JSON.stringify(timeline, null, 2));

    const summary = moderation.loadContestSummary(artefactPath);
    expect(summary.summary.totals.contestsObserved).toBeGreaterThanOrEqual(1);
    expect(summary.summary.durations.arming.samples).toBe(1);
    expect(summary.summary.durations.resolution.samples).toBe(1);
  });
});
