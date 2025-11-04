"use strict";

const { SearchSyncRetryQueue } = require("../../../src/offline/publishing/searchSyncRetryQueue");

describe("SearchSyncRetryQueue", () => {
  const baseTime = new Date("2025-11-05T10:00:00.000Z");
  const clock = () => new Date(baseTime);

  function createMetrics() {
    return {
      recordSearchRetryQueued: jest.fn()
    };
  }

  function createDrift(overrides = {}) {
    return Object.assign(
      {
        jobId: "index-lore-bundle-001",
        index: "lore_bundles",
        documentId: "bundle-001",
        reason: "version_mismatch"
      },
      overrides
    );
  }

  test("enqueues retry job with exponential delay and logs telemetry", () => {
    const metrics = createMetrics();
    const queue = new SearchSyncRetryQueue({ clock, metrics });
    const drift = createDrift();

    const job = queue.enqueue({
      sessionId: "session-123",
      batchId: "session-123-batch-0",
      drift
    });

    expect(job.jobId).toBe(drift.jobId);
    expect(job.retryAt).toBe("2025-11-05T10:05:00.000Z");
    expect(job.attempt).toBe(1);
    expect(queue.getPending()).toHaveLength(1);
    expect(metrics.recordSearchRetryQueued).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-123",
        batchId: "session-123-batch-0",
        jobId: drift.jobId,
        reason: drift.reason
      })
    );
  });

  test("clamps attempts to maxAttempts and drains queue", () => {
    const metrics = createMetrics();
    const queue = new SearchSyncRetryQueue({ clock, metrics, maxAttempts: 2 });
    const drift = createDrift({ reason: "failure" });

    const job = queue.enqueue({
      sessionId: "session-999",
      batchId: "session-999-batch-0",
      drift,
      attempt: 5
    });

    expect(job.attempt).toBe(2);
    expect(job.retryAt).toBe("2025-11-05T10:10:00.000Z");
    expect(queue.getPending()).toHaveLength(1);

    const drained = queue.drain();
    expect(drained).toHaveLength(1);
    expect(queue.getPending()).toHaveLength(0);
  });

  test("summarizes pending jobs and clears after drain", () => {
    const metrics = createMetrics();
    const queue = new SearchSyncRetryQueue({ clock, metrics });

    queue.enqueue({
      sessionId: "session-777",
      batchId: "session-777-batch-0",
      drift: createDrift({ jobId: "index-lore-bundle-777" })
    });

    queue.enqueue({
      sessionId: "session-777",
      batchId: "session-777-batch-0",
      drift: createDrift({ jobId: "index-news-card-777", index: "news_cards" }),
      attempt: 2
    });

    const summary = queue.summarize();
    expect(summary.status).toBe("pending");
    expect(summary.pendingCount).toBe(2);
    expect(summary.nextRetryAt).toBe("2025-11-05T10:05:00.000Z");
    expect(Array.isArray(summary.jobs)).toBe(true);
    expect(summary.jobs).toHaveLength(2);

    queue.drain();

    const cleared = queue.summarize();
    expect(cleared.status).toBe("clear");
    expect(cleared.pendingCount).toBe(0);
    expect(cleared.nextRetryAt).toBeNull();
    expect(cleared.jobs).toEqual([]);
  });
});
