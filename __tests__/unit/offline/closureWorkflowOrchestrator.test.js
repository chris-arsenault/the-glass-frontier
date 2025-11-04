"use strict";

const { ClosureWorkflowOrchestrator } = require("../../../src/offline/closureWorkflowOrchestrator");
const { SessionClosureCoordinator } = require("../../../src/offline/sessionClosureCoordinator");
const { SessionMemoryFacade } = require("../../../src/memory/sessionMemory");
const { PublishingCoordinator } = require("../../../src/offline/publishing/publishingCoordinator");
const { StoryConsolidationWorkflow } = require("../../../src/offline/storyConsolidation/storyConsolidationWorkflow");

function createClockSequence(timestamps) {
  const queue = timestamps.map((value) => new Date(value));
  const fallback = queue[queue.length - 1] || new Date();
  return jest.fn(() => {
    if (queue.length === 0) {
      return new Date(fallback);
    }
    return new Date(queue.shift());
  });
}

async function waitForJobStatus(coordinator, jobId, status, attempts = 10) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const job = coordinator.getJob(jobId);
    if (job && job.status === status) {
      return job;
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(`Job ${jobId} did not reach status ${status}`);
}

describe("ClosureWorkflowOrchestrator", () => {
  test("processes closure job and clears offline pending flag", async () => {
    const clock = createClockSequence([
      "2025-11-04T00:00:00.000Z",
      "2025-11-04T00:01:00.000Z",
      "2025-11-04T00:04:00.000Z",
      "2025-11-04T00:04:30.000Z"
    ]);
    const publisher = { publish: jest.fn() };
    const coordinator = new SessionClosureCoordinator({ publisher, clock });
    const sessionMemory = new SessionMemoryFacade();
    const checkBus = { emitAdminAlert: jest.fn() };
    const storyWorkflow = new StoryConsolidationWorkflow({ clock });
    const publishingCoordinator = new PublishingCoordinator({ clock });

    const orchestrator = new ClosureWorkflowOrchestrator({
      coordinator,
      sessionMemory,
      checkBus,
      clock,
      storyConsolidationWorkflow: storyWorkflow,
      publishingCoordinator
    });

    orchestrator.start();

    const sessionId = "session-test-1";
    sessionMemory.ensureSession(sessionId);
    sessionMemory.appendTranscript(sessionId, {
      role: "gm",
      text: "The Prismwell Kite Guild seized the Kyther Range Vault after a daring raid.",
      turnId: "turn-1",
      sceneId: "scene-1"
    });
    sessionMemory.markSessionClosed(sessionId, {
      closedAt: "2025-11-04T00:00:00.000Z",
      closedBy: "account-1",
      auditRef: "audit-1"
    });

    const job = coordinator.enqueueClosure({
      sessionId,
      auditRef: "audit-1",
      reason: "session.closed"
    });

    const completed = await waitForJobStatus(coordinator, job.jobId, "completed");
    expect(completed.result).toEqual(
      expect.objectContaining({
        deltaCount: expect.any(Number),
        mentionCount: expect.any(Number)
      })
    );

    const sessionState = sessionMemory.getSessionState(sessionId);
    expect(sessionState.pendingOfflineReconcile).toBe(false);
    expect(sessionState.lastOfflineWorkflowRun).toEqual(
      expect.objectContaining({
        status: "completed",
        durationMs: expect.any(Number),
        deltaCount: expect.any(Number),
        mentionCount: expect.any(Number),
        moderationPendingCount: expect.any(Number)
      })
    );
    expect(sessionState.moderation.queue).toEqual(
      expect.objectContaining({
        pendingCount: expect.any(Number),
        generatedAt: expect.any(String)
      })
    );
    expect(sessionState.offlineReconciledAt).toBeDefined();
    expect(checkBus.emitAdminAlert).not.toHaveBeenCalled();
  });

  test("records failure and emits admin alert when workflow errors", async () => {
    const clock = createClockSequence([
      "2025-11-04T01:00:00.000Z",
      "2025-11-04T01:01:00.000Z",
      "2025-11-04T01:02:00.000Z"
    ]);
    const coordinator = new SessionClosureCoordinator({ clock, publisher: { publish: jest.fn() } });
    const sessionMemory = new SessionMemoryFacade();
    const checkBus = { emitAdminAlert: jest.fn() };

    const orchestrator = new ClosureWorkflowOrchestrator({
      coordinator,
      sessionMemory,
      checkBus,
      clock,
      entityExtractor: () => {
        throw new Error("extraction boom");
      },
      storyConsolidationWorkflow: new StoryConsolidationWorkflow({ clock })
    });

    orchestrator.start();

    const sessionId = "session-test-2";
    sessionMemory.ensureSession(sessionId);
    sessionMemory.appendTranscript(sessionId, {
      role: "gm",
      text: "The Prismwell Kite Guild attempted to seize the vault.",
      turnId: "turn-1"
    });
    sessionMemory.markSessionClosed(sessionId, {
      closedAt: "2025-11-04T01:00:00.000Z",
      closedBy: "account-2",
      auditRef: "audit-failure"
    });

    const job = coordinator.enqueueClosure({
      sessionId,
      auditRef: "audit-failure"
    });

    const failed = await waitForJobStatus(coordinator, job.jobId, "failed");
    expect(failed.error).toEqual(
      expect.objectContaining({
        message: "extraction boom"
      })
    );

    const sessionState = sessionMemory.getSessionState(sessionId);
    expect(sessionState.pendingOfflineReconcile).toBe(true);
    expect(sessionState.lastOfflineWorkflowRun).toEqual(
      expect.objectContaining({
        status: "failed",
        error: "extraction boom"
      })
    );
    expect(checkBus.emitAdminAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "offline.workflow_failed",
        data: expect.objectContaining({
          jobId: job.jobId,
          message: "extraction boom"
        })
      })
    );
  });
});
