"use strict";

import { v4 as uuid  } from "uuid";
import { PublishingMetrics  } from "../../telemetry/publishingMetrics.js";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

class BundleComposer {
  constructor(options = {}) {
    this.clock = options.clock || (() => new Date());
    this.metrics = options.metrics || new PublishingMetrics();
  }

  compose(options = {}) {
    const {
      sessionId,
      deltas = [],
      batchId = `batch-${uuid()}`,
      scheduledAt,
      moderationDecisionId = null,
      approvedBy = "admin.auto"
    } = options;

    if (!sessionId) {
      throw new Error("bundle_composer_requires_session_id");
    }

    const publishReference = scheduledAt ? new Date(scheduledAt) : this.clock();
    if (Number.isNaN(publishReference.getTime())) {
      throw new Error("bundle_composer_invalid_schedule");
    }
    const preparedAt = this.clock().toISOString();

    this.metrics.recordBatchPrepared({
      sessionId,
      batchId,
      deltaCount: deltas.length,
      scheduledAt: publishReference.toISOString()
    });

    if (deltas.length === 0) {
      return {
        preparedAt,
        loreBundles: [],
        newsCards: [],
        overlayPayloads: []
      };
    }

    const grouped = groupByEntity(deltas);
    const loreBundles = Array.from(grouped.values()).map((entityDeltas) =>
      buildLoreBundle({
        sessionId,
        deltas: entityDeltas,
        publishAt: publishReference,
        preparedAt,
        moderationDecisionId,
        approvedBy
      })
    );

    const newsCards = deltas.map((delta) =>
      buildNewsCard({
        sessionId,
        delta,
        publishAt: publishReference
      })
    );

    const overlayPayloads = newsCards.map(buildOverlayPayload);

    return {
      preparedAt,
      loreBundles,
      newsCards,
      overlayPayloads
    };
  }
}

function groupByEntity(deltas) {
  const grouped = new Map();
  deltas.forEach((delta) => {
    if (!grouped.has(delta.entityId)) {
      grouped.set(delta.entityId, []);
    }
    grouped.get(delta.entityId).push(delta);
  });
  return grouped;
}

function buildLoreBundle({ sessionId, deltas, publishAt, preparedAt, moderationDecisionId, approvedBy }) {
  const [first] = deltas;
  const bundleId = `bundle-${first.entityId}-${uuid().slice(0, 8)}`;
  const summaryLines = deltas.map(describeDeltaChange);

  return {
    bundleId,
    entityId: first.entityId,
    entityType: first.entityType,
    canonicalName: first.canonicalName || first.entityId,
    entityRefs: Array.from(new Set(deltas.flatMap(gatherEntityRefs))),
    summaryMarkdown: renderSummaryMarkdown(first, summaryLines),
    publishAt: publishAt.toISOString(),
    preparedAt,
    revisions: deltas.map((delta, index) => ({
      version: index + 1,
      deltaId: delta.deltaId,
      editor: delta.safety?.reviewedBy || approvedBy,
      appliedAt: preparedAt
    })),
    provenance: {
      sessionId,
      moderationDecisionId,
      deltaIds: deltas.map((delta) => delta.deltaId)
    },
    safetyTags: collectSafetyTags(deltas),
    status: "ready"
  };
}

function renderSummaryMarkdown(delta, summaryLines) {
  const header = delta.canonicalName || delta.entityId;
  const bullets = summaryLines.map((line) => `- ${line}`).join("\n");
  return `### ${header}\n${bullets}`;
}

function describeDeltaChange(delta) {
  const fragments = [];
  const controlAdditions = delta.proposedChanges?.control?.add || [];
  const controlRemovals = delta.proposedChanges?.control?.remove || [];

  if (controlAdditions.length > 0) {
    fragments.push(`gains control of ${controlAdditions.join(", ")}`);
  }

  if (controlRemovals.length > 0) {
    fragments.push(`relinquishes ${controlRemovals.join(", ")}`);
  }

  if (delta.proposedChanges?.status) {
    fragments.push(`status shifts to ${delta.proposedChanges.status}`);
  }

  if (delta.proposedChanges?.threats?.add?.length) {
    fragments.push(`threats noted: ${delta.proposedChanges.threats.add.join(", ")}`);
  }

  if (fragments.length === 0) {
    fragments.push("lore bundle updated");
  }

  return fragments.join("; ");
}

function gatherEntityRefs(delta) {
  const refs = [delta.entityId];
  const controlAdditions = delta.proposedChanges?.control?.add || [];
  const controlRemovals = delta.proposedChanges?.control?.remove || [];
  return refs.concat(controlAdditions, controlRemovals).filter(Boolean);
}

function collectSafetyTags(deltas) {
  const tags = new Set();
  deltas.forEach((delta) => {
    if (delta.safety?.reasons) {
      delta.safety.reasons.forEach((reason) => tags.add(reason));
    }
    if (delta.safety?.requiresModeration) {
      tags.add("moderation_required");
    }
  });
  return Array.from(tags);
}

function buildNewsCard({ sessionId, delta, publishAt }) {
  const cardId = `news-${delta.deltaId}`;
  const baseName = delta.canonicalName || delta.entityId;
  const headline = `${baseName} update`;
  const lead = describeDeltaChange(delta);
  const publishAtIso = publishAt.toISOString();
  const expiresAtIso = new Date(publishAt.getTime() + NINETY_DAYS_MS).toISOString();

  return {
    cardId,
    headline,
    lead,
    factionTags: delta.entityType === "faction" ? [delta.entityId] : [],
    urgency: delta.safety?.requiresModeration ? "high" : "routine",
    publishAt: publishAtIso,
    expiresAt: expiresAtIso,
    cardType: "flash",
    provenanceRefs: [sessionId, delta.deltaId],
    safetyTags: collectSafetyTags([delta]),
    ariaSummary: `${headline}: ${lead}`
  };
}

function buildOverlayPayload(card) {
  return {
    type: "overlay.loreLink",
    headline: card.headline,
    publishAt: card.publishAt,
    urgency: card.urgency,
    newsCardRef: card.cardId,
    provenanceBadge: {
      label: "Lore Drop",
      context: card.cardType,
      severity: card.urgency === "high" ? "warn" : "info"
    }
  };
}

export {
  BundleComposer
};
