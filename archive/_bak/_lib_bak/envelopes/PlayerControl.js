"use strict";

import { BaseEnvelope } from "./BaseEnvelope.js";

/**
 * Envelope for player control commands
 * Corresponds to: player.control
 */
class PlayerControl extends BaseEnvelope {
  constructor(data) {
    super(data.type || "player.control", data, {
      id: data.id,
      markers: data.markers,
      turnSequence: data.turnSequence
    });

    this.controlId = data.id || `control-${Date.now()}`;
    this.sessionId = data.sessionId;
    this.controlType = data.controlType || data.type || "wrap";
    this.turns = typeof data.turns === "number" ? data.turns : null;
    this.metadata = data.metadata ? { ...data.metadata } : {};
    this.submittedAt = data.submittedAt || new Date().toISOString();
  }

  serialize() {
    const envelope = {
      type: this.type,
      id: this.controlId,
      sessionId: this.sessionId,
      controlType: this.controlType,
      submittedAt: this.submittedAt
    };

    if (this.turns !== null) {
      envelope.turns = this.turns;
    }

    if (Object.keys(this.metadata).length > 0) {
      envelope.metadata = this.metadata;
    }

    if (this.markers && this.markers.length > 0) {
      envelope.markers = this.markers;
    }

    return envelope;
  }

  static deserialize(data) {
    return new PlayerControl(data);
  }

  validate() {
    super.validate();

    if (!this.sessionId) {
      throw new Error("PlayerControl must have a sessionId");
    }

    return true;
  }
}

export { PlayerControl };
