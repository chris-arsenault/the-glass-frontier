"use strict";

const { PublishingCoordinator } = require("../../../src/offline/publishing/publishingCoordinator");

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
    expect(preparation.publishing.loreBundles).toHaveLength(1);
    expect(preparation.searchPlan.jobs).toHaveLength(2);
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
    expect(metrics.recordBatchPublished).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-789",
        batchId
      })
    );
    expect(metrics.recordSearchDrift).not.toHaveBeenCalled();
    expect(publication.drifts).toHaveLength(0);
  });
});
