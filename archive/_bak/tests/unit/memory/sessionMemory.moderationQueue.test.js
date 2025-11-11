"use strict";

import { SessionMemoryFacade  } from "../../../_src_bak/memory/sessionMemory.js";

describe("SessionMemoryFacade · moderation queue events", () => {
  it("notifies listeners when a moderation queue is recorded", () => {
    const sessionMemory = new SessionMemoryFacade();
    const notifications = [];

    sessionMemory.onModerationQueueUpdated((sessionId, queue) => {
      notifications.push({ sessionId, queue });
    });

    sessionMemory.recordModerationQueue("session-notify", {
      generatedAt: "2025-11-04T16:00:00.000Z",
      items: [
        {
          deltaId: "delta-1",
          status: "needs-review",
          blocking: true
        }
      ],
      window: {
        startAt: "2025-11-04T16:00:00.000Z",
        endAt: "2025-11-04T16:45:00.000Z"
      }
    });

    expect(notifications).toHaveLength(1);
    expect(notifications[0].sessionId).toBe("session-notify");
    expect(notifications[0].queue.pendingCount).toBe(1);
    expect(Array.isArray(notifications[0].queue.items)).toBe(true);
  });

  it("stops notifying removed moderation queue listeners", () => {
    const sessionMemory = new SessionMemoryFacade();
    const first = jest.fn();
    const second = jest.fn();

    const unsubscribeFirst = sessionMemory.onModerationQueueUpdated(first);
    sessionMemory.onModerationQueueUpdated(second);

    sessionMemory.recordModerationQueue("session-cleanup", {
      generatedAt: "2025-11-04T16:05:00.000Z",
      items: []
    });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    unsubscribeFirst();

    sessionMemory.updateModerationCadence("session-cleanup", {
      nextBatchAt: "2025-11-04T17:00:00.000Z"
    });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });
});
