"use strict";

const fs = require("fs");
const path = require("path");
const {
  validateCapabilityRefs
} = require("../moderation/prohibitedCapabilitiesRegistry");
const { HubValidationError } = require("./commandErrors");

function readConfig(filePath) {
  const absolutePath = path.resolve(filePath);
  const raw = fs.readFileSync(absolutePath, "utf8");
  return JSON.parse(raw);
}

function buildRateLimit(config = {}) {
  if (config === false) {
    return { enabled: false };
  }

  const {
    burst = 5,
    perSeconds = 10,
    shared = false,
    scope = "actor",
    errorCode = "hub_rate_limited"
  } = config;

  if (!Number.isInteger(burst) || burst <= 0) {
    throw new HubValidationError("invalid_rate_limit_burst", { burst });
  }
  if (!Number.isInteger(perSeconds) || perSeconds <= 0) {
    throw new HubValidationError("invalid_rate_limit_window", { perSeconds });
  }
  if (scope !== "actor" && scope !== "room") {
    throw new HubValidationError("invalid_rate_limit_scope", { scope });
  }

  return {
    enabled: true,
    burst,
    perSeconds,
    shared: Boolean(shared),
    scope,
    errorCode
  };
}

function normalizeParameter(entry) {
  if (!entry?.name) {
    throw new HubValidationError("verb_parameter_missing_name", { entry });
  }

  const type = entry.type || "string";
  const normalized = {
    name: entry.name,
    type,
    required: Boolean(entry.required),
    maxLength: Number.isInteger(entry.maxLength) ? entry.maxLength : null,
    enum: Array.isArray(entry.enum) ? [...entry.enum] : null,
    description: entry.description || null
  };

  if (normalized.enum && normalized.enum.length === 0) {
    throw new HubValidationError("verb_parameter_enum_empty", { entry });
  }

  return normalized;
}

function normalizeNarrative(entry = {}) {
  return {
    escalation: entry.escalation || "auto",
    narrationTemplate: entry.narrationTemplate || null,
    checkTemplate: entry.checkTemplate || null
  };
}

function normalizeVerbDefinition(raw) {
  if (!raw?.verbId) {
    throw new HubValidationError("verb_missing_id", { raw });
  }

  const capabilities = validateCapabilityRefs(raw.capabilities || []);
  const parameters = Array.isArray(raw.parameters)
    ? raw.parameters.map(normalizeParameter)
    : [];

  const normalized = {
    verbId: raw.verbId,
    label: raw.label || raw.verbId,
    category: raw.category || "misc",
    description: raw.description || "",
    parameters,
    capabilities,
    safetyTags: Array.isArray(raw.safetyTags) ? [...new Set(raw.safetyTags)] : [],
    momentum: raw.momentum || null,
    narrative: normalizeNarrative(raw.narrative),
    rateLimit: buildRateLimit(raw.rateLimit),
    replayable: raw.replayable !== false
  };

  return normalized;
}

class VerbCatalog {
  constructor(definitions = []) {
    this.verbs = new Map();
    definitions.forEach((definition) => this.add(definition));
  }

  add(definition) {
    if (this.verbs.has(definition.verbId)) {
      throw new HubValidationError("duplicate_verb", { verbId: definition.verbId });
    }
    this.verbs.set(definition.verbId, definition);
  }

  get(verbId) {
    return this.verbs.get(verbId) || null;
  }

  list() {
    return Array.from(this.verbs.values());
  }

  static fromConfig(config) {
    if (!config || !Array.isArray(config.verbs)) {
      throw new HubValidationError("verb_catalog_missing_verbs");
    }
    const definitions = config.verbs.map(normalizeVerbDefinition);
    return new VerbCatalog(definitions);
  }

  static fromFile(filePath) {
    const config = readConfig(filePath);
    return VerbCatalog.fromConfig(config);
  }
}

module.exports = {
  VerbCatalog,
  normalizeVerbDefinition,
  readConfig
};
