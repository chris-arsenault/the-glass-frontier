"use strict";

import fs from "fs";
import path from "path";
import { validateCapabilityRefs
 } from "../moderation/prohibitedCapabilitiesRegistry.js";
import { HubValidationError  } from "./commandErrors.js";

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

function normalizeContest(entry = null) {
  if (!entry || entry.enabled === false) {
    return null;
  }

  const targetParameter = entry.targetParameter;
  if (!targetParameter || typeof targetParameter !== "string") {
    throw new HubValidationError("verb_contest_missing_target_parameter", { entry });
  }

  const windowSeconds =
    typeof entry.windowSeconds === "number" && entry.windowSeconds > 0 ? entry.windowSeconds : 8;

  const roles = {
    initiator:
      typeof entry.roles?.initiator === "string" && entry.roles.initiator.trim().length > 0
        ? entry.roles.initiator
        : "challenger",
    target:
      typeof entry.roles?.target === "string" && entry.roles.target.trim().length > 0
        ? entry.roles.target
        : "defender",
    support:
      typeof entry.roles?.support === "string" && entry.roles.support.trim().length > 0
        ? entry.roles.support
        : "participant"
  };

  const moderationTags = Array.isArray(entry.moderationTags)
    ? [...new Set(entry.moderationTags.filter((tag) => typeof tag === "string" && tag.length > 0))]
    : [];

  const sharedComplicationTags = Array.isArray(entry.sharedComplicationTags)
    ? [
        ...new Set(
          entry.sharedComplicationTags.filter((tag) => typeof tag === "string" && tag.length > 0)
        )
      ]
    : [];

  const maxParticipants =
    typeof entry.maxParticipants === "number" && entry.maxParticipants >= 2
      ? Math.floor(entry.maxParticipants)
      : 2;

  return {
    enabled: true,
    type: entry.type || "pvp",
    label: entry.label || null,
    move: entry.move || null,
    checkTemplate: entry.checkTemplate || null,
    targetParameter,
    windowMs: windowSeconds * 1000,
    roles,
    moderationTags,
    sharedComplicationTags,
    maxParticipants,
    broadcast: entry.broadcast !== false
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
    replayable: raw.replayable !== false,
    contest: normalizeContest(raw.contest)
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

export {
  VerbCatalog,
  normalizeVerbDefinition,
  readConfig
};
