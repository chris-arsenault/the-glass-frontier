"use strict";

const { SearchSyncPlanner } = require("../../../src/offline/publishing/searchSync");

describe("SearchSyncPlanner", () => {
  function createPlanner() {
    const metrics = {
      recordSearchSyncPlanned: jest.fn(),
      recordSearchDrift: jest.fn()
    };
    const planner = new SearchSyncPlanner({ metrics });
    return { planner, metrics };
  }

  function createPublishingResult() {
    return {
      loreBundles: [
        {
          bundleId: "bundle-123",
          summaryMarkdown: "### Prismwell\n- gains control",
          entityId: "faction.prismwell-kite-guild",
          publishAt: "2025-11-05T11:30:00.000Z",
          safetyTags: ["moderation_required"],
          provenance: { sessionId: "session-1" },
          revisions: [{ version: 1 }]
        }
      ],
      newsCards: [
        {
          cardId: "card-456",
          headline: "Prismwell update",
          lead: "gains control",
          publishAt: "2025-11-05T11:30:00.000Z",
          expiresAt: "2026-02-03T11:30:00.000Z",
          urgency: "routine",
          safetyTags: []
        }
      ]
    };
  }

  test("builds search indexing jobs and records telemetry", () => {
    const { planner, metrics } = createPlanner();
    const result = createPublishingResult();

    const plan = planner.plan(result, {
      sessionId: "session-1",
      batchId: "batch-1"
    });

    expect(plan.jobs).toHaveLength(2);
    expect(plan.jobs[0]).toMatchObject({
      index: "lore_bundles",
      documentId: "bundle-123",
      expectedVersion: 1
    });
    expect(plan.jobs[1]).toMatchObject({
      index: "news_cards",
      documentId: "card-456",
      expectedVersion: 1
    });

    expect(metrics.recordSearchSyncPlanned).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        batchId: "batch-1",
        jobCount: 2
      })
    );
  });

  test("detects drift across failed or version-mismatched jobs", () => {
    const { planner, metrics } = createPlanner();
    const drifts = planner.evaluate([
      {
        index: "lore_bundles",
        documentId: "bundle-123",
        status: "failed",
        expectedVersion: 1,
        actualVersion: 0
      },
      {
        index: "news_cards",
        documentId: "card-456",
        status: "success",
        expectedVersion: 1,
        actualVersion: 2
      },
      {
        index: "news_cards",
        documentId: "card-789",
        status: "success",
        expectedVersion: 1,
        actualVersion: 1
      }
    ]);

    expect(drifts).toHaveLength(2);
    expect(metrics.recordSearchDrift).toHaveBeenCalledTimes(2);
    expect(metrics.recordSearchDrift).toHaveBeenCalledWith(
      expect.objectContaining({
        index: "lore_bundles",
        documentId: "bundle-123",
        reason: "failed"
      })
    );
    expect(metrics.recordSearchDrift).toHaveBeenCalledWith(
      expect.objectContaining({
        index: "news_cards",
        documentId: "card-456",
        reason: "version_mismatch"
      })
    );
  });
});
