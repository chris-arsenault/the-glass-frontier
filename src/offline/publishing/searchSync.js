"use strict";

const { PublishingMetrics } = require("../../telemetry/publishingMetrics");

class SearchSyncPlanner {
  constructor(options = {}) {
    this.metrics = options.metrics || new PublishingMetrics();
  }

  plan(publishingResult = {}, context = {}) {
    const jobs = [];
    const { sessionId = null, batchId = null } = context;

    (publishingResult.loreBundles || []).forEach((bundle) => {
      jobs.push(buildLoreJob(bundle));
    });

    (publishingResult.newsCards || []).forEach((card) => {
      jobs.push(buildNewsJob(card));
    });

    this.metrics.recordSearchSyncPlanned({
      sessionId,
      batchId,
      jobCount: jobs.length
    });

    return { jobs };
  }

  evaluate(jobResults = []) {
    const drifts = [];
    jobResults.forEach((result) => {
      if (result.status !== "success") {
        drifts.push({ ...result, reason: result.status });
        this.metrics.recordSearchDrift({
          index: result.index,
          documentId: result.documentId,
          reason: result.status,
          expectedVersion: result.expectedVersion,
          actualVersion: result.actualVersion
        });
        return;
      }

      const { expectedVersion, actualVersion } = result;
      if (
        typeof expectedVersion === "number" &&
        typeof actualVersion === "number" &&
        expectedVersion !== actualVersion
      ) {
        drifts.push({ ...result, reason: "version_mismatch" });
        this.metrics.recordSearchDrift({
          index: result.index,
          documentId: result.documentId,
          reason: "version_mismatch",
          expectedVersion,
          actualVersion
        });
      }
    });

    return drifts;
  }
}

function buildLoreJob(bundle) {
  return {
    jobId: `index-lore-${bundle.bundleId}`,
    index: "lore_bundles",
    documentId: bundle.bundleId,
    type: "loreBundle",
    body: {
      bundleId: bundle.bundleId,
      summaryMarkdown: bundle.summaryMarkdown,
      entityId: bundle.entityId,
      publishAt: bundle.publishAt,
      safetyTags: bundle.safetyTags,
      provenance: bundle.provenance
    },
    expectedVersion: Array.isArray(bundle.revisions) ? bundle.revisions.length : 1
  };
}

function buildNewsJob(card) {
  return {
    jobId: `index-news-${card.cardId}`,
    index: "news_cards",
    documentId: card.cardId,
    type: "newsCard",
    body: {
      cardId: card.cardId,
      headline: card.headline,
      lead: card.lead,
      publishAt: card.publishAt,
      expiresAt: card.expiresAt,
      urgency: card.urgency,
      safetyTags: card.safetyTags
    },
    expectedVersion: 1
  };
}

module.exports = {
  SearchSyncPlanner
};
