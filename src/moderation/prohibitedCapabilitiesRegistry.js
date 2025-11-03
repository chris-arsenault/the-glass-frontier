"use strict";

const REGISTRY = new Map([
  [
    "capability.spectrum-bloom-array",
    {
      capabilityId: "capability.spectrum-bloom-array",
      label: "Spectrum Bloom Flux Array",
      severity: "critical",
      rationale:
        "Legendary device claims simultaneous resonance across every band. Violates Resonance Charter safeguards noted in WORLD_BIBLE.md (Technology · Spectrum Bloom Flux Array)."
    }
  ],
  [
    "capability.temporal-retcon",
    {
      capabilityId: "capability.temporal-retcon",
      label: "Temporal Retcon Protocol",
      severity: "high",
      rationale:
        "Time rewriting rituals contradict DES-13 rules framework and Tempered Accord governance; referenced in WORLD_BIBLE chronology safeguards."
    }
  ],
  [
    "capability.mass-mind-control",
    {
      capabilityId: "capability.mass-mind-control",
      label: "Mass Mind Control",
      severity: "critical",
      rationale:
        "Explicitly barred by the Prohibited Capabilities List in REQUIREMENTS.md and faction governance notes within WORLD_BIBLE (Tempered Accord Custodial Council)."
    }
  ],
  [
    "capability.spectrumless-manifest",
    {
      capabilityId: "capability.spectrumless-manifest",
      label: "Spectrumless Manifestation",
      severity: "critical",
      rationale:
        "Legends Watch entry flags Spectrumless claims as moderator escalations; violates safety hooks in WORLD_BIBLE cosmology."
    }
  ]
]);

function listCapabilities() {
  return Array.from(REGISTRY.values()).map((entry) => ({ ...entry }));
}

function getCapability(capabilityId) {
  if (typeof capabilityId !== "string") {
    return null;
  }
  const entry = REGISTRY.get(capabilityId);
  return entry ? { ...entry } : null;
}

function normalizeCapabilityRef(ref) {
  if (!ref || typeof ref.capabilityId !== "string") {
    const error = new Error("invalid_capability_reference");
    error.code = "invalid_capability_reference";
    throw error;
  }

  const capability = getCapability(ref.capabilityId);
  if (!capability) {
    const error = new Error("unknown_capability_reference");
    error.code = "unknown_capability_reference";
    error.capabilityId = ref.capabilityId;
    throw error;
  }

  const severity = ref.severity || capability.severity;
  if (severity !== capability.severity) {
    const error = new Error("capability_severity_mismatch");
    error.code = "capability_severity_mismatch";
    error.capabilityId = ref.capabilityId;
    error.expectedSeverity = capability.severity;
    error.providedSeverity = severity;
    throw error;
  }

  return {
    capabilityId: capability.capabilityId,
    severity: capability.severity,
    label: capability.label,
    rationale: capability.rationale,
    source: ref.source || null
  };
}

function validateCapabilityRefs(refs) {
  if (!Array.isArray(refs) || refs.length === 0) {
    return [];
  }

  const normalized = refs.map(normalizeCapabilityRef);
  const unique = new Map();
  normalized.forEach((ref) => {
    unique.set(ref.capabilityId, ref);
  });
  return Array.from(unique.values());
}

module.exports = {
  getCapability,
  listCapabilities,
  validateCapabilityRefs
};
