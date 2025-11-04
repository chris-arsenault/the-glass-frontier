"use strict";

const { SessionMemoryFacade } = require("../../../../src/memory/sessionMemory");
const {
  TemporalModerationBridge
} = require("../../../../src/offline/moderation/temporalModerationBridge");

describe("offline/moderation/temporalModerationBridge", () => {
  it("hydrates existing queue states and forwards them to Temporal", async () => {
    const sessionMemory = new SessionMemoryFacade();
    const queueStore = {
      listQueues: jest.fn().mockResolvedValue([
        {
          sessionId: "session-hydrate",
          state: {
            generatedAt: "2025-11-04T16:00:00.000Z",
            pendingCount: 1,
            items: [
              { deltaId: "delta-1", status: "needs-review", blocking: true }
            ]
          }
        }
      ])
    };
    const temporalClient = {
      syncCadenceSnapshot: jest.fn().mockResolvedValue(null)
    };

    const bridge = new TemporalModerationBridge({
      sessionMemory,
      queueStore,
      temporalClient,
      clock: () => new Date("2025-11-04T16:05:00.000Z")
    });

    await bridge.start();

    expect(queueStore.listQueues).toHaveBeenCalledTimes(1);
    expect(temporalClient.syncCadenceSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-hydrate",
        queue: expect.objectContaining({
          pendingCount: 1
        }),
        timestamp: "2025-11-04T16:05:00.000Z"
      })
    );
  });

  it("subscribes to SessionMemory updates and forwards new snapshots", async () => {
    const sessionMemory = new SessionMemoryFacade();
    const temporalClient = {
      syncCadenceSnapshot: jest.fn().mockResolvedValue(null)
    };

    const bridge = new TemporalModerationBridge({
      sessionMemory,
      temporalClient,
      clock: () => new Date("2025-11-04T17:00:00.000Z")
    });

    await bridge.start();
    sessionMemory.recordModerationQueue("session-update", {
      generatedAt: "2025-11-04T16:55:00.000Z",
      items: [
        {
          deltaId: "delta-new",
          status: "needs-review",
          blocking: true
        }
      ]
    });

    await new Promise((resolve) => setImmediate(resolve));

    expect(temporalClient.syncCadenceSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-update",
        queue: expect.objectContaining({
          pendingCount: 1
        }),
        timestamp: "2025-11-04T17:00:00.000Z"
      })
    );

    await bridge.stop();
    sessionMemory.recordModerationQueue("session-update", {
      generatedAt: "2025-11-04T17:05:00.000Z",
      items: []
    });

    await new Promise((resolve) => setImmediate(resolve));
    expect(temporalClient.syncCadenceSnapshot).toHaveBeenCalledTimes(1);
  });

  it("records retry telemetry and retries with backoff on transport failures", async () => {
    const sessionMemory = new SessionMemoryFacade();
    const metrics = {
      recordTemporalSyncAttempt: jest.fn(),
      recordTemporalSyncSuccess: jest.fn(),
      recordTemporalSyncFailure: jest.fn(),
      recordTemporalSyncRetryScheduled: jest.fn(),
      recordTemporalSyncGiveUp: jest.fn()
    };
    const temporalClient = {
      syncCadenceSnapshot: jest
        .fn()
        .mockRejectedValueOnce(
          Object.assign(new Error("server_error"), {
            status: 503,
            code: "temporal_moderation_sync_failed"
          })
        )
        .mockResolvedValueOnce(null)
    };

    const bridge = new TemporalModerationBridge({
      sessionMemory,
      temporalClient,
      metrics,
      clock: () => new Date(),
      retryOptions: {
        baseDelayMs: 25,
        maxDelayMs: 100,
        maxAttempts: 3,
        jitterRatio: 0
      }
    });

    await bridge.start();

    sessionMemory.recordModerationQueue("session-retry", {
      generatedAt: "2025-11-04T18:00:00.000Z",
      items: [
        {
          deltaId: "delta-retry",
          status: "needs-review",
          blocking: true
        }
      ]
    });

    await new Promise((resolve) => setImmediate(resolve));

    expect(temporalClient.syncCadenceSnapshot).toHaveBeenCalledTimes(1);
    expect(metrics.recordTemporalSyncAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "session-retry", attempt: 1 })
    );
    expect(metrics.recordTemporalSyncFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-retry",
        attempt: 1,
        willRetry: true
      })
    );
    expect(metrics.recordTemporalSyncRetryScheduled).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-retry",
        attempt: 2,
        backoffMs: 25
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 40));
    await new Promise((resolve) => setImmediate(resolve));

    expect(temporalClient.syncCadenceSnapshot).toHaveBeenCalledTimes(2);
    expect(metrics.recordTemporalSyncAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "session-retry", attempt: 2 })
    );
    expect(metrics.recordTemporalSyncSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "session-retry", attempt: 2 })
    );

    await bridge.stop();
  });

  it("records give up telemetry when failures are not retryable", async () => {
    const sessionMemory = new SessionMemoryFacade();
    const metrics = {
      recordTemporalSyncAttempt: jest.fn(),
      recordTemporalSyncSuccess: jest.fn(),
      recordTemporalSyncFailure: jest.fn(),
      recordTemporalSyncRetryScheduled: jest.fn(),
      recordTemporalSyncGiveUp: jest.fn()
    };
    const temporalClient = {
      syncCadenceSnapshot: jest
        .fn()
        .mockRejectedValue(
          Object.assign(new Error("bad_request"), {
            status: 400,
            code: "temporal_bad_request"
          })
        )
    };

    const bridge = new TemporalModerationBridge({
      sessionMemory,
      temporalClient,
      metrics,
      clock: () => new Date("2025-11-04T19:00:00.000Z"),
      retryOptions: {
        baseDelayMs: 500,
        maxAttempts: 2
      }
    });

    await bridge.start();

    sessionMemory.recordModerationQueue("session-failure", {
      generatedAt: "2025-11-04T19:00:00.000Z",
      items: []
    });

    await new Promise((resolve) => setImmediate(resolve));

    expect(metrics.recordTemporalSyncAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "session-failure", attempt: 1 })
    );
    expect(metrics.recordTemporalSyncFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-failure",
        attempt: 1,
        willRetry: false
      })
    );
    expect(metrics.recordTemporalSyncRetryScheduled).not.toHaveBeenCalled();
    expect(metrics.recordTemporalSyncGiveUp).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-failure",
        attempts: 1
      })
    );

    await bridge.stop();
  });
});
