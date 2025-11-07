"use strict";

import { PublishingCadence, DEFAULT_CONFIG  } from "../../../_src_bak/offline/publishing/publishingCadence.js";

describe("PublishingCadence", () => {
  const sessionClosedAt = new Date("2025-11-05T10:00:00.000Z");
  const clock = () => new Date("2025-11-05T10:00:00.000Z");

  function createCadence(config = {}) {
    return new PublishingCadence({
      clock,
      config: Object.assign({}, DEFAULT_CONFIG, config)
    });
  }

  test("plans moderation, lore batch, and digest windows per DES-16 blueprint", () => {
    const cadence = createCadence();
    const state = cadence.planForSession({
      sessionId: "session-001",
      sessionClosedAt
    });

    expect(state.moderation.startAt).toBe("2025-11-05T10:15:00.000Z");
    expect(state.moderation.endAt).toBe("2025-11-05T11:00:00.000Z");
    expect(state.moderation.escalations).toEqual([
      "2025-11-05T10:45:00.000Z",
      "2025-11-05T10:55:00.000Z"
    ]);

    expect(state.batches).toHaveLength(1);
    expect(state.batches[0].runAt).toBe("2025-11-05T11:00:00.000Z");
    expect(state.digest.runAt).toBe("2025-11-06T02:00:00.000Z");
    expect(state.history[0].type).toBe("cadence.initialised");
  });

  test("applies admin override within 12 hour defer window", () => {
    const cadence = createCadence();
    cadence.planForSession({
      sessionId: "session-override",
      sessionClosedAt
    });

    const updated = cadence.applyOverride("session-override", {
      deferByMinutes: 90,
      actor: "admin.aurora",
      reason: "Awaiting lore rewrite"
    });

    expect(updated.batches[0].runAt).toBe("2025-11-05T12:30:00.000Z");
    expect(updated.batches[0].override).toMatchObject({
      actor: "admin.aurora",
      reason: "Awaiting lore rewrite",
      target: "loreBatch"
    });

    expect(updated.overrides).toHaveLength(1);
    expect(updated.history).toHaveLength(2);
    expect(updated.history[1].type).toBe("cadence.override.applied");
  });

  test("rejects overrides beyond the configured defer limit", () => {
    const cadence = createCadence();
    cadence.planForSession({
      sessionId: "session-limit",
      sessionClosedAt
    });

    expect(() =>
      cadence.applyOverride("session-limit", {
        deferByMinutes: (DEFAULT_CONFIG.maxOverrideDeferMinutes || 720) + 10
      })
    ).toThrow("publishing_override_exceeds_limit");
  });

  test("returns defensive copies of schedules to avoid accidental mutation", () => {
    const cadence = createCadence();
    const planned = cadence.planForSession({
      sessionId: "session-copy",
      sessionClosedAt
    });

    const schedule = cadence.getSchedule("session-copy");
    schedule.batches[0].runAt = "mutated";
    schedule.overrides.push({ fake: true });

    const fresh = cadence.getSchedule("session-copy");
    expect(fresh.batches[0].runAt).toBe(planned.batches[0].runAt);
    expect(fresh.overrides).toHaveLength(0);
  });

  test("updates batch status and records metadata history", () => {
    const cadence = createCadence();
    cadence.planForSession({
      sessionId: "session-status",
      sessionClosedAt
    });

    const updated = cadence.updateBatchStatus("session-status", "session-status-batch-0", "ready", {
      preparedAt: "2025-11-05T11:05:00.000Z",
      deltaCount: 2,
      notes: "Batch prepared for publishing"
    });

    expect(updated.batches[0]).toMatchObject({
      status: "ready",
      preparedAt: "2025-11-05T11:05:00.000Z",
      deltaCount: 2,
      notes: "Batch prepared for publishing"
    });

    const history = updatesHistory(cadence.getSchedule("session-status"));
    expect(history).toContain("cadence.batch.status");
  });
});

function updatesHistory(schedule) {
  return schedule.history.map((entry) => entry.type);
}
