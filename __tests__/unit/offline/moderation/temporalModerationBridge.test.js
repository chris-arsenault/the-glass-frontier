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
});
