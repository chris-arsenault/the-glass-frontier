"use strict";

import { PublishingCoordinator  } from "../../../_src_bak/offline/publishing/publishingCoordinator.js";

describe("PublishingCoordinator", () => {
  const sessionClosedAt = "2025-11-05T10:00:00.000Z";
  const clock = () => new Date("2025-11-05T10:00:00.000Z");

  function createCoordinator() {
    const metrics = {
      recordBatchPrepared: jest.fn(),
      recordBatchPublished: jest.fn(),
      recordSearchSyncPlanned: jest.fn(),
      recordSearchDrift: jest.fn()
    };

    const coordinator = new PublishingCoordinator({
      clock,
      metrics
    });

    return { coordinator, metrics };
  }

  function createDelta(overrides = {}) {
    return Object.assign(
      {
        deltaId: "delta-001",
        entityId: "faction.prismwell-kite-guild",
        entityType: "faction",
        canonicalName: "Prismwell Kite Guild",
        proposedChanges: {
          control: { add: ["region.auroral-span"], remove: [] }
        },
        safety: {
          requiresModeration: false,
          reasons: []
        }
      },
      overrides
    );
  }

  test("prepares publishing batch and marks it published without drift", () => {
    const { coordinator, metrics } = createCoordinator();
    const delta = createDelta();

    const preparation = coordinator.prepareBatch({
      sessionId: "session-789",
      sessionClosedAt,
      deltas: [delta],
      moderationDecisionId: "mod-002",
      approvedBy: "admin.eira"
    });

    const schedule = preparation.schedule;
    const batchId = schedule.batches[0].batchId;

    expect(schedule.batches[0].status).toBe("ready");
    expect(schedule.moderation.status).toBe("clear");
    expect(preparation.status).toBe("ready");
    expect(preparation.moderation.requiresModeration).toBe(false);
    expect(preparation.publishing.loreBundles).toHaveLength(1);
    expect(preparation.searchPlan.jobs).toHaveLength(2);
    expect(preparation.moderationQueue).toEqual(
      expect.objectContaining({
        status: "clear",
        pendingCount: 0
      })
    );
    expect(metrics.recordBatchPrepared).toHaveBeenCalled();
    expect(metrics.recordSearchSyncPlanned).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-789",
        batchId
      })
    );

    const searchResults = [
      {
        index: "lore_bundles",
        documentId: preparation.publishing.loreBundles[0].bundleId,
        status: "success",
        expectedVersion: 1,
        actualVersion: 1
      },
      {
        index: "news_cards",
        documentId: preparation.publishing.newsCards[0].cardId,
        status: "success",
        expectedVersion: 1,
        actualVersion: 1
      }
    ];

    const publication = coordinator.markBatchPublished("session-789", batchId, {
      searchResults
    });

    expect(publication.schedule.batches[0].status).toBe("published");
    expect(publication.retrySummary).toEqual(
      expect.objectContaining({
        pendingCount: 0,
        status: "clear"
      })
    );
    expect(metrics.recordBatchPublished).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-789",
        batchId
      })
    );
    expect(metrics.recordSearchDrift).not.toHaveBeenCalled();
    expect(publication.drifts).toHaveLength(0);
    expect(publication.retryJobs).toHaveLength(0);
  });

  test("awaits moderation when deltas require approval", () => {
    const { coordinator, metrics } = createCoordinator();
    const delta = createDelta({
      safety: {
        requiresModeration: true,
        reasons: ["capability_violation"]
      }
    });

    const gated = coordinator.prepareBatch({
      sessionId: "session-555",
      sessionClosedAt,
      deltas: [delta]
    });

    expect(gated.status).toBe("awaiting_moderation");
    expect(gated.schedule.batches[0].status).toBe("awaiting_moderation");
    expect(gated.schedule.moderation.status).toBe("awaiting_review");
    expect(gated.publishing).toBeNull();
    expect(gated.searchPlan.jobs).toHaveLength(0);
    expect(gated.moderation.requiresModeration).toBe(true);
    expect(gated.moderation.reasons).toContain("capability_violation");
    expect(gated.moderationQueue).toEqual(
      expect.objectContaining({
        status: "awaiting_moderation",
        pendingCount: 1
      })
    );
    expect(metrics.recordBatchPrepared).not.toHaveBeenCalled();
    expect(metrics.recordSearchSyncPlanned).not.toHaveBeenCalled();

    const approved = coordinator.prepareBatch({
      sessionId: "session-555",
      sessionClosedAt,
      deltas: [delta],
      moderationDecisionId: "mod-approval-01",
      approvedBy: "admin.eira"
    });

    expect(approved.status).toBe("ready");
    expect(approved.publishing.loreBundles).toHaveLength(1);
    expect(approved.schedule.batches[0].status).toBe("ready");
    expect(approved.schedule.moderation.status).toBe("clear");
    expect(approved.moderationQueue).toEqual(
      expect.objectContaining({
        status: "clear",
        pendingCount: 0
      })
    );
    expect(metrics.recordBatchPrepared).toHaveBeenCalledTimes(1);
    expect(metrics.recordSearchSyncPlanned).toHaveBeenCalledTimes(1);
  });

  test("queues retries when search drift detected", () => {
    const metrics = {
      recordBatchPrepared: jest.fn(),
      recordBatchPublished: jest.fn(),
      recordSearchSyncPlanned: jest.fn(),
      recordSearchDrift: jest.fn()
    };

    const retryQueue = {
      enqueue: jest.fn().mockImplementation(({ drift }) => ({
        retryId: `retry-${drift.jobId}`,
        jobId: drift.jobId
      }))
    };

    const coordinator = new PublishingCoordinator({
      clock,
      metrics,
      retryQueue
    });

    const delta = createDelta();
    const preparation = coordinator.prepareBatch({
      sessionId: "session-222",
      sessionClosedAt,
      deltas: [delta]
    });

    const batchId = preparation.schedule.batches[0].batchId;
    const searchResults = [
      {
        index: "lore_bundles",
        documentId: "bundle-xyz",
        status: "failure",
        expectedVersion: 1,
        actualVersion: 0
      }
    ];

    const publication = coordinator.markBatchPublished("session-222", batchId, {
      searchResults,
      attempt: 2
    });

    expect(metrics.recordSearchDrift).toHaveBeenCalledTimes(1);
    expect(retryQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-222",
        batchId,
        attempt: 2
      })
    );
    expect(publication.retryJobs).toHaveLength(1);
    expect(publication.retryJobs[0].jobId).toBe("lore_bundles-bundle-xyz");
    expect(publication.retrySummary).toEqual(
      expect.objectContaining({
        pendingCount: 1,
        status: "pending"
      })
    );
    expect(publication.schedule.batches[0].status).toBe("retry_pending");
  });
});
