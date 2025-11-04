"use strict";

function summarizeModeration(deltas = []) {
  const summary = {
    requiresModeration: false,
    reasons: [],
    capabilityViolations: 0,
    conflictDetections: 0,
    lowConfidenceFindings: 0
  };

  const reasonSet = new Set();

  deltas.forEach((delta) => {
    if (!delta || !delta.safety) {
      return;
    }

    if (delta.safety.requiresModeration) {
      summary.requiresModeration = true;
    }

    const reasons = Array.isArray(delta.safety.reasons) ? delta.safety.reasons : [];
    reasons.forEach((reason) => {
      reasonSet.add(reason);
      if (reason === "capability_violation") {
        summary.capabilityViolations += 1;
      }
      if (reason === "conflict_detected") {
        summary.conflictDetections += 1;
      }
      if (reason === "low_confidence") {
        summary.lowConfidenceFindings += 1;
      }
    });
  });

  summary.reasons = Array.from(reasonSet).sort();
  return summary;
}

module.exports = {
  summarizeModeration
};
