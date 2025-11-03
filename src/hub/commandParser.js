"use strict";

const { HubValidationError } = require("./commandErrors");

function normalizeArgs(parameters, provided = {}) {
  const normalized = {};

  parameters.forEach((parameter) => {
    const value = provided[parameter.name];
    if (parameter.required && (value === undefined || value === null || value === "")) {
      throw new HubValidationError("verb_parameter_missing", {
        parameter: parameter.name
      });
    }

    if (value === undefined || value === null) {
      return;
    }

    if (parameter.type === "string") {
      if (typeof value !== "string") {
        throw new HubValidationError("verb_parameter_type_mismatch", {
          parameter: parameter.name,
          expected: "string"
        });
      }
      if (parameter.maxLength && value.length > parameter.maxLength) {
        throw new HubValidationError("verb_parameter_length_exceeded", {
          parameter: parameter.name,
          maxLength: parameter.maxLength
        });
      }
    }

    if (parameter.enum && !parameter.enum.includes(value)) {
      throw new HubValidationError("verb_parameter_enum_invalid", {
        parameter: parameter.name,
        value,
        allowed: parameter.enum
      });
    }

    normalized[parameter.name] = value;
  });

  return normalized;
}

class CommandParser {
  constructor({ verbCatalog, rateLimiter, clock = Date }) {
    if (!verbCatalog) {
      throw new HubValidationError("missing_verb_catalog");
    }
    this.verbCatalog = verbCatalog;
    this.rateLimiter = rateLimiter;
    this.clock = clock;
  }

  parse(command) {
    const { verb: verbId, actorId, roomId, hubId, args = {}, metadata = {} } = command || {};

    if (!verbId) {
      throw new HubValidationError("missing_verb");
    }
    if (!actorId) {
      throw new HubValidationError("missing_actor_id");
    }
    if (!roomId) {
      throw new HubValidationError("missing_room_id");
    }
    if (!hubId) {
      throw new HubValidationError("missing_hub_id");
    }

    const definition = this.verbCatalog.get(verbId);
    if (!definition) {
      throw new HubValidationError("unknown_verb", { verbId });
    }

    if (definition.rateLimit && this.rateLimiter) {
      this.rateLimiter.enforce(definition.rateLimit, {
        actorId,
        verbId,
        scope: definition.rateLimit.scope
      });
    }

    const normalizedArgs = normalizeArgs(definition.parameters, args);

    const actorCapabilities = Array.isArray(metadata.actorCapabilities)
      ? metadata.actorCapabilities
      : [];

    const missingCapabilities = definition.capabilities
      .map((capability) => capability.capabilityId)
      .filter((capabilityId) => !actorCapabilities.includes(capabilityId));

    if (missingCapabilities.length > 0) {
      throw new HubValidationError("missing_required_capability", {
        verbId,
        missingCapabilities
      });
    }

    const issuedAt =
      metadata.issuedAt ||
      (this.clock && typeof this.clock.now === "function" ? this.clock.now() : Date.now());

    return {
      verb: definition,
      actorId,
      roomId,
      hubId,
      args: normalizedArgs,
      metadata: {
        ...metadata,
        issuedAt
      },
      requiresNarrative: definition.narrative.escalation !== "none",
      replayable: definition.replayable !== false
    };
  }
}

module.exports = {
  CommandParser
};
