"use strict";

import { BaseEnvelope } from "./BaseEnvelope.js";
import { AdminAlert } from "./AdminAlert.js";
import { CheckRequest } from "./CheckRequest.js";
import { CheckResult } from "./CheckResult.js";
import { HubStateEvent } from "./HubStateEvent.js";
import { MarkerEvent } from "./MarkerEvent.js";
import { ModerationDecision } from "./ModerationDecision.js";
import { NarrationEvent } from "./NarrationEvent.js";
import { OfflineJobEvent } from "./OfflineJobEvent.js";
import { OverlaySync } from "./OverlaySync.js";
import { PlayerControl } from "./PlayerControl.js";
import { SessionStatusEvent } from "./SessionStatusEvent.js";

/**
 * Factory function to deserialize envelopes based on type
 * @param {Object} data - Raw envelope data
 * @returns {BaseEnvelope} Appropriate envelope instance
 */
function deserializeEnvelope(data) {
  if (!data || !data.type) {
    throw new Error("Invalid envelope: missing type");
  }

  const type = data.type;

  // Admin envelopes
  if (type === "admin.alert") {
    return AdminAlert.deserialize(data);
  }

  if (type === "moderation.decision") {
    return ModerationDecision.deserialize(data);
  }

  if (type === "session.statusChanged" || type === "session.closed") {
    return SessionStatusEvent.deserialize(data);
  }

  if (type.startsWith("offline.sessionClosure.")) {
    return OfflineJobEvent.deserialize(data);
  }

  // Narration envelopes
  if (type === "session.message" || type === "narrative.event") {
    return NarrationEvent.deserialize(data);
  }

  if (type === "session.marker") {
    return MarkerEvent.deserialize(data);
  }

  if (type === "intent.checkRequest" || type === "check.prompt") {
    return CheckRequest.deserialize(data);
  }

  if (type === "event.checkResolved" || type === "check.result") {
    return CheckResult.deserialize(data);
  }

  if (type === "hub.stateSnapshot" || type === "hub.stateUpdate") {
    return HubStateEvent.deserialize(data);
  }

  if (type === "overlay.characterSync") {
    return OverlaySync.deserialize(data);
  }

  if (type === "player.control") {
    return PlayerControl.deserialize(data);
  }

  // Default to base envelope for unknown types
  return BaseEnvelope.deserialize(data);
}

export {
  BaseEnvelope,
  AdminAlert,
  CheckRequest,
  CheckResult,
  HubStateEvent,
  MarkerEvent,
  ModerationDecision,
  NarrationEvent,
  OfflineJobEvent,
  OverlaySync,
  PlayerControl,
  SessionStatusEvent,
  deserializeEnvelope
};
