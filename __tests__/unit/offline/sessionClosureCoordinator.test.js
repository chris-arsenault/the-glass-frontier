"use strict";

const { SessionClosureCoordinator } = require("../../../src/offline/sessionClosureCoordinator");

describe("SessionClosureCoordinator", () => {
  test("enqueues closure job and notifies listeners", async () => {
    const publisher = { publish: jest.fn() };
    const timeline = [
      new Date("2025-11-04T00:00:00.000Z"),
      new Date("2025-11-04T00:00:30.000Z")
    ];
    const clock = jest.fn(() => timeline.shift() || new Date("2025-11-04T00:01:00.000Z"));
    const coordinator = new SessionClosureCoordinator({ publisher, clock });

    const listener = jest.fn();
    coordinator.onJobQueued(listener);

    const job = coordinator.enqueueClosure({
      sessionId: "session-1",
      auditRef: "audit-abc"
    });

    expect(job.status).toBe("queued");
    expect(job.enqueuedAt).toBe("2025-11-04T00:00:00.000Z");
    expect(publisher.publish).toHaveBeenCalledWith(
      "offline.sessionClosure.queued",
      expect.objectContaining({
        jobId: job.jobId,
        sessionId: "session-1"
      })
    );

    await new Promise((resolve) => setImmediate(resolve));
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ jobId: job.jobId }));
  });

  test("transitions job through processing and completion", () => {
    const timeline = [
      new Date("2025-11-04T00:00:00.000Z"),
      new Date("2025-11-04T00:02:00.000Z")
    ];
    const clock = jest.fn(() => timeline.shift() || new Date("2025-11-04T00:05:00.000Z"));
    const publisher = { publish: jest.fn() };
    const coordinator = new SessionClosureCoordinator({ publisher, clock });

    const job = coordinator.enqueueClosure({ sessionId: "session-42" });
    const started = coordinator.startJob(job.jobId);
    expect(started.status).toBe("processing");
    expect(started.attempts).toBe(1);
    expect(started.startedAt).toBe("2025-11-04T00:02:00.000Z");

    const completed = coordinator.completeJob(job.jobId, { deltaCount: 3 });
    expect(completed.status).toBe("completed");
    expect(completed.result).toEqual({ deltaCount: 3 });
    expect(completed.completedAt).toBe("2025-11-04T00:05:00.000Z");
    expect(typeof completed.durationMs).toBe("number");
    expect(completed.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("marks job failure with error metadata", () => {
    const clock = jest.fn(() => new Date("2025-11-04T00:00:00.000Z"));
    const coordinator = new SessionClosureCoordinator({ clock, publisher: { publish: jest.fn() } });
    const job = coordinator.enqueueClosure({ sessionId: "session-77" });
    coordinator.startJob(job.jobId);
    const failure = coordinator.failJob(job.jobId, new Error("workflow exploded"));

    expect(failure.status).toBe("failed");
    expect(failure.error).toEqual(
      expect.objectContaining({
        message: "workflow exploded"
      })
    );
  });
});
