"use strict";

import { HubValidationError  } from "./commandErrors.js";

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

function buildContestMetadata(definition, args, context) {
  const contestConfig = definition?.contest;
  if (!contestConfig || contestConfig.enabled === false) {
    return null;
  }

  const targetActorId = contestConfig.targetParameter ? args[contestConfig.targetParameter] : null;
  if (!targetActorId || typeof targetActorId !== "string") {
    throw new HubValidationError("verb_contest_missing_target_actor", {
      verbId: definition.verbId,
      targetParameter: contestConfig.targetParameter
    });
  }

  const rematchConfig = contestConfig.rematch || {};
  const fallbackRematchCooldownSeconds =
    typeof contestConfig.rematchCooldownSeconds === "number"
      ? contestConfig.rematchCooldownSeconds
      : null;

  let rematchCooldownMs = null;
  if (rematchConfig && rematchConfig.enabled === false) {
    rematchCooldownMs = null;
  } else if (
    typeof rematchConfig.cooldownMs === "number" &&
    Number.isFinite(rematchConfig.cooldownMs) &&
    rematchConfig.cooldownMs >= 0
  ) {
    rematchCooldownMs = Math.floor(rematchConfig.cooldownMs);
  } else if (
    typeof rematchConfig.cooldownSeconds === "number" &&
    Number.isFinite(rematchConfig.cooldownSeconds) &&
    rematchConfig.cooldownSeconds >= 0
  ) {
    rematchCooldownMs = Math.floor(rematchConfig.cooldownSeconds * 1000);
  } else if (
    typeof fallbackRematchCooldownSeconds === "number" &&
    Number.isFinite(fallbackRematchCooldownSeconds) &&
    fallbackRematchCooldownSeconds >= 0
  ) {
    rematchCooldownMs = Math.floor(fallbackRematchCooldownSeconds * 1000);
  } else {
    rematchCooldownMs = 12000;
  }

  let rematchOfferWindowMs = null;
  if (
    typeof rematchConfig.offerWindowMs === "number" &&
    Number.isFinite(rematchConfig.offerWindowMs) &&
    rematchConfig.offerWindowMs > 0
  ) {
    rematchOfferWindowMs = Math.floor(rematchConfig.offerWindowMs);
  } else if (
    typeof rematchConfig.offerWindowSeconds === "number" &&
    Number.isFinite(rematchConfig.offerWindowSeconds) &&
    rematchConfig.offerWindowSeconds > 0
  ) {
    rematchOfferWindowMs = Math.floor(rematchConfig.offerWindowSeconds * 1000);
  }

  const actorSet = new Set([context.actorId, targetActorId]);
  const contestKey = `${definition.verbId}:${Array.from(actorSet).sort().join("::")}`;
  const roles = contestConfig.roles || {};
  const participantArgs = JSON.parse(JSON.stringify(args || {}));

  return {
    enabled: true,
    hubId: context.hubId,
    roomId: context.roomId,
    sessionId: context.metadata?.sessionId || null,
    contestKey,
    type: contestConfig.type || "pvp",
    move: contestConfig.move || definition.verbId,
    label: contestConfig.label || definition.label,
    checkTemplate: contestConfig.checkTemplate || definition.narrative?.checkTemplate || null,
    targetParameter: contestConfig.targetParameter,
    targetActorId,
    windowMs:
      typeof contestConfig.windowMs === "number" && contestConfig.windowMs > 0
        ? contestConfig.windowMs
        : 8000,
    roles,
    moderationTags: Array.isArray(contestConfig.moderationTags)
      ? [...contestConfig.moderationTags]
      : [],
    sharedComplicationTags: Array.isArray(contestConfig.sharedComplicationTags)
      ? [...contestConfig.sharedComplicationTags]
      : [],
    maxParticipants:
      typeof contestConfig.maxParticipants === "number" && contestConfig.maxParticipants >= 2
        ? Math.floor(contestConfig.maxParticipants)
        : 2,
    broadcast: contestConfig.broadcast !== false,
    participants: [
      {
        actorId: context.actorId,
        role: roles.initiator || "challenger",
        verbId: definition.verbId,
        args: participantArgs,
        targetActorId,
        auditRef: context.metadata?.auditRef || null,
        issuedAt: context.issuedAt
      }
    ],
    contestActors: Array.from(actorSet),
    createdAt: context.issuedAt,
    rematch:
      rematchCooldownMs !== null
        ? {
            cooldownMs: rematchCooldownMs,
            offerWindowMs: rematchOfferWindowMs,
            recommendedVerb: rematchConfig.recommendedVerb || contestConfig.move || definition.verbId
          }
        : null
  };
}

class CommandParser {
  constructor({ verbCatalog, rateLimiter, clock = Date, catalogResolver = null }) {
    if (!verbCatalog && typeof catalogResolver !== "function") {
      throw new HubValidationError("missing_verb_catalog");
    }
    this.verbCatalog = verbCatalog || null;
    this.catalogResolver = catalogResolver || null;
    this.rateLimiter = rateLimiter;
    this.clock = clock;
  }

  parse(command, { verbCatalog } = {}) {
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

    const catalog =
      verbCatalog ||
      this.verbCatalog ||
      (this.catalogResolver ? this.catalogResolver(hubId) : null);

    if (!catalog) {
      throw new HubValidationError("missing_verb_catalog");
    }

    const definition = catalog.get(verbId);
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

    const contestMetadata = buildContestMetadata(definition, normalizedArgs, {
      actorId,
      hubId,
      roomId,
      metadata,
      issuedAt
    });

    if (contestMetadata) {
      const contestedActors = new Set(
        Array.isArray(metadata.contestedActors) ? metadata.contestedActors : []
      );
      contestMetadata.contestActors.forEach((actor) => contestedActors.add(actor));
      metadata.contest = contestMetadata;
      metadata.contestedActors = Array.from(contestedActors);
    }

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

export {
  CommandParser
};
