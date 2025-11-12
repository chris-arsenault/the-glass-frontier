"use strict";

import { v4 as uuid  } from "uuid";
import { validateCapabilityRefs  } from "../../moderation/prohibitedCapabilitiesRegistry.js";
import { log  } from "../../utils/logger.js";

function deepClone(input) {
  return JSON.parse(JSON.stringify(input));
}

function confidenceTier(score) {
  if (score >= 0.85) {
    return "high";
  }

  if (score >= 0.65) {
    return "medium";
  }

  return "low";
}

function isMeaningfulChange(before, after) {
  return JSON.stringify(before) !== JSON.stringify(after);
}

class WorldDeltaQueue {
  constructor(options = {}) {
    this.canon = options.canonState ? deepClone(options.canonState) : {};
    this.publisher = options.publisher || {
      publishAlert: (payload) => {
        log("warn", "admin.alert synthetic dispatch", { payload });
      }
    };
    this.queue = [];
    this.fieldIndex = new Map();
  }

  enqueueFromMentions(mentions) {
    if (!Array.isArray(mentions)) {
      throw new Error("world_delta_queue_requires_mentions");
    }

    const deltas = [];
    mentions.forEach((mention) => {
      const delta = this.createDeltaFromMention(mention);
      if (!delta) {
        return;
      }

      this.queue.push(delta);
      deltas.push(delta);

      if (delta.safety.requiresModeration) {
        this.publisher.publishAlert({
          topic: "admin.alert",
          severity: "high",
          reason: "world_delta_requires_moderation",
          data: {
            deltaId: delta.deltaId,
            entityId: delta.entityId,
            safety: delta.safety
          }
        });
      }
    });

    return deltas;
  }

  createDeltaFromMention(mention) {
    if (!mention || !mention.proposedChanges) {
      if (Array.isArray(mention?.capabilityRefs) && mention.capabilityRefs.length > 0) {
        return this.buildCapabilityOnlyDelta(mention);
      }
      return null;
    }

    const canonState = this.canon[mention.entityId] || {};
    const before = deepClone(canonState);
    const after = applyProposedChanges(before, mention.proposedChanges);

    if (!isMeaningfulChange(before, after)) {
      return null;
    }

    const normalizedCapabilities = normalizeCapabilityRefsSafe(mention.capabilityRefs || []);
    const safety = this.evaluateSafety(mention, before, after, normalizedCapabilities);

    const requiresModeration = Boolean(safety.requiresModeration);
    const delta = {
      deltaId: uuid(),
      entityId: mention.entityId,
      entityType: mention.entityType,
      canonicalName: mention.canonicalName,
      confidence: mention.confidence,
      confidenceTier: confidenceTier(mention.confidence),
      source: mention.source || {},
      proposedChanges: deepClone(mention.proposedChanges),
      capabilityRefs: normalizedCapabilities,
      before,
      after,
      safety,
      status: requiresModeration ? "needs-review" : "pending",
      createdAt: new Date().toISOString()
    };

    this.indexFields(delta);
    return delta;
  }

  buildCapabilityOnlyDelta(mention) {
    const normalizedCapabilities = normalizeCapabilityRefsSafe(mention.capabilityRefs || []);
    if (normalizedCapabilities.length === 0) {
      return null;
    }

    return {
      deltaId: uuid(),
      entityId: mention.entityId,
      entityType: mention.entityType,
      canonicalName: mention.canonicalName,
      confidence: mention.confidence,
      confidenceTier: confidenceTier(mention.confidence),
      source: mention.source || {},
      proposedChanges: null,
      capabilityRefs: normalizedCapabilities,
      before: {},
      after: {},
      safety: {
        requiresModeration: true,
        reasons: ["capability_violation"],
        capabilityViolations: normalizedCapabilities,
        confidence: confidenceTier(mention.confidence)
      },
      status: "needs-review",
      createdAt: new Date().toISOString()
    };
  }

  evaluateSafety(mention, before, after, capabilityRefs) {
    const safety = {
      requiresModeration: false,
      reasons: [],
      capabilityViolations: capabilityRefs,
      confidence: confidenceTier(mention.confidence)
    };

    if (mention.confidence < 0.6) {
      safety.requiresModeration = true;
      safety.reasons.push("low_confidence");
    }

    if (capabilityRefs.length > 0) {
      safety.requiresModeration = true;
      safety.reasons.push("capability_violation");
    }

    const conflicts = detectConflicts(mention, before, after, this.canon, this.fieldIndex);
    if (conflicts.length > 0) {
      safety.requiresModeration = true;
      safety.reasons.push("conflict_detected");
      safety.conflicts = conflicts;
    }

    return safety;
  }

  indexFields(delta) {
    if (!delta.proposedChanges) {
      return;
    }

    Object.entries(delta.proposedChanges).forEach(([field, changeValue]) => {
      const key = `${delta.entityId}:${field}`;
      this.fieldIndex.set(key, {
        entityId: delta.entityId,
        field,
        value: changeValue,
        deltaId: delta.deltaId
      });
    });
  }

  getPending() {
    return this.queue.slice();
  }
}

function applyProposedChanges(base, changes) {
  const result = deepClone(base);
  if (changes.control) {
    const beforeControl = Array.isArray(result.control) ? [...result.control] : [];
    const controlSet = new Set(beforeControl);

    (changes.control.add || []).forEach((entityId) => controlSet.add(entityId));
    (changes.control.remove || []).forEach((entityId) => controlSet.delete(entityId));

    result.control = Array.from(controlSet);
  }

  if (changes.status) {
    result.status = changes.status;
  }

  if (changes.threats) {
    const beforeThreats = Array.isArray(result.threats) ? [...result.threats] : [];
    const threatSet = new Set(beforeThreats);
    (changes.threats.add || []).forEach((threat) => threatSet.add(threat));
    (changes.threats.remove || []).forEach((threat) => threatSet.delete(threat));
    result.threats = Array.from(threatSet);
  }

  return result;
}

function normalizeCapabilityRefsSafe(refs) {
  if (!Array.isArray(refs) || refs.length === 0) {
    return [];
  }

  try {
    return validateCapabilityRefs(refs);
  } catch (error) {
    log("error", "capability normalization failed", { error: error.message });
    return [];
  }
}

function detectConflicts(mention, before, after, canon, fieldIndex) {
  const conflicts = [];

  if (mention.proposedChanges?.control) {
    const addTargets = mention.proposedChanges.control.add || [];
    addTargets.forEach((targetRegionId) => {
      const region = canon[targetRegionId];
      if (
        region &&
        region.controllingFaction &&
        region.controllingFaction !== mention.entityId
      ) {
        conflicts.push({
          type: "control_collision",
          target: targetRegionId,
          currentOwner: region.controllingFaction
        });
      }

      const fieldKey = `${mention.entityId}:control`;
      const indexed = fieldIndex.get(fieldKey);
      if (
        indexed &&
        Array.isArray(indexed.value.add) &&
        !indexed.value.add.includes(targetRegionId)
      ) {
        conflicts.push({
          type: "pending_delta_conflict",
          target: targetRegionId,
          conflictingDeltaId: indexed.deltaId
        });
      }
    });
  }

  if (mention.proposedChanges?.status && before.status && before.status !== after.status) {
    const fieldKey = `${mention.entityId}:status`;
    const indexed = fieldIndex.get(fieldKey);
    if (indexed && indexed.value !== mention.proposedChanges.status) {
      conflicts.push({
        type: "status_conflict",
        previous: indexed.value,
        proposed: mention.proposedChanges.status,
        conflictingDeltaId: indexed.deltaId
      });
    }
  }

  return conflicts;
}

export {
  WorldDeltaQueue,
  applyProposedChanges,
  detectConflicts
};
