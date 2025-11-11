"use strict";

import { SessionDirectory  } from "../../../_src_bak/auth/sessionDirectory.js";
import { SessionMemoryFacade  } from "../../../_src_bak/memory/sessionMemory.js";
import { PublishingCadence  } from "../../../_src_bak/offline/publishing/publishingCadence.js";

describe("SessionDirectory.closeSession", () => {
  test("marks the session closed and schedules offline cadence", () => {
    const fixedNow = new Date("2025-11-04T01:00:00.000Z");
    const clock = () => new Date(fixedNow);
    const sessionMemory = new SessionMemoryFacade();
    const publishingCadence = new PublishingCadence({ clock });

    const directory = new SessionDirectory({
      sessionMemory,
      publishingCadence,
      clock
    });

    directory.registerSession("account-1", {
      sessionId: "session-1",
      title: "Test Session"
    });

    const summary = directory.closeSession("account-1", "session-1", {
      reason: "test.close",
      auditRef: "audit-123"
    });

    expect(summary.status).toBe("closed");
    expect(summary.offlinePending).toBe(true);
    expect(summary.cadence).toMatchObject({
      nextDigestAt: expect.any(String),
      moderationWindow: expect.objectContaining({
        startAt: expect.any(String),
        endAt: expect.any(String)
      })
    });

    const sessionState = sessionMemory.getSessionState("session-1");
    expect(sessionState.pendingOfflineReconcile).toBe(true);
    expect(sessionState.closureReason).toBe("test.close");
    expect(sessionState.lastClosureAuditRef).toBe("audit-123");
    expect(sessionState.closedAt).toBeDefined();
  });
});
