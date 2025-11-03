"use strict";

const { BundleComposer } = require("../../../src/offline/publishing/bundleComposer");

describe("BundleComposer", () => {
  const publishAt = "2025-11-05T11:30:00.000Z";
  const clock = () => new Date("2025-11-05T11:00:00.000Z");

  function createComposer(metricsOverrides = {}) {
    const metrics = Object.assign(
      {
        recordBatchPrepared: jest.fn()
      },
      metricsOverrides
    );
    const composer = new BundleComposer({ clock, metrics });
    return { composer, metrics };
  }

  function createDelta(overrides = {}) {
    return Object.assign(
      {
        deltaId: "delta-001",
        entityId: "faction.prismwell-kite-guild",
        entityType: "faction",
        canonicalName: "Prismwell Kite Guild",
        proposedChanges: {
          control: { add: ["region.morning-brink"], remove: [] },
          status: "ascendant"
        },
        safety: {
          requiresModeration: false,
          reasons: []
        }
      },
      overrides
    );
  }

  test("creates lore bundle, news card, and overlay payload with provenance", () => {
    const { composer, metrics } = createComposer();
    const delta = createDelta();

    const result = composer.compose({
      sessionId: "session-123",
      batchId: "batch-123",
      deltas: [delta],
      scheduledAt: publishAt,
      moderationDecisionId: "mod-789",
      approvedBy: "admin.elara"
    });

    expect(metrics.recordBatchPrepared).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-123",
        batchId: "batch-123",
        deltaCount: 1
      })
    );

    expect(result.loreBundles).toHaveLength(1);
    const bundle = result.loreBundles[0];
    expect(bundle.provenance).toEqual({
      sessionId: "session-123",
      moderationDecisionId: "mod-789",
      deltaIds: ["delta-001"]
    });
    expect(bundle.summaryMarkdown).toContain("Prismwell Kite Guild");
    expect(bundle.summaryMarkdown).toContain("gains control of region.morning-brink");
    expect(bundle.revisions[0].editor).toBe("admin.elara");

    expect(result.newsCards).toHaveLength(1);
    expect(result.newsCards[0]).toMatchObject({
      headline: "Prismwell Kite Guild update",
      lead: expect.stringContaining("gains control"),
      cardType: "flash"
    });

    expect(result.overlayPayloads).toHaveLength(1);
    expect(result.overlayPayloads[0]).toMatchObject({
      type: "overlay.loreLink",
      newsCardRef: result.newsCards[0].cardId
    });
  });

  test("handles empty delta batches while still emitting telemetry", () => {
    const { composer, metrics } = createComposer();
    const result = composer.compose({
      sessionId: "session-empty",
      batchId: "batch-empty",
      deltas: []
    });

    expect(metrics.recordBatchPrepared).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-empty",
        batchId: "batch-empty",
        deltaCount: 0
      })
    );
    expect(result.loreBundles).toHaveLength(0);
    expect(result.newsCards).toHaveLength(0);
    expect(result.overlayPayloads).toHaveLength(0);
  });
});
