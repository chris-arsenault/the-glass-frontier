"use strict";

import { BaseDTO } from "./BaseDTO.ts";

/**
 * Envelope for narration events (messages)
 * Corresponds to: session.message, narrative.event
 */
class NarrationEvent extends BaseDTO {
  static type = "narrative.event";

  constructor(data) {
    super(data.type || "narrative.event", data, {
      id: data.id,
      markers: data.markers,
      turnSequence: data.turnSequence
    });

    this.messageId = data.id;
    this.role = data.role || data.speaker || "gm";
    this.content = data.content || data.text || "";
    this.speaker = data.speaker || data.role || "gm";
    this.playerId = data.playerId || null;
    this.metadata = data.metadata ? { ...data.metadata } : {};
  }

  serialize() {
    const envelope = {
      type: this.type,
      id: this.messageId,
      role: this.role,
      content: this.content,
      speaker: this.speaker,
      metadata: this.metadata
    };

    if (this.playerId) {
      envelope.playerId = this.playerId;
    }

    if (this.markers && this.markers.length > 0) {
      envelope.markers = this.markers;
    }

    if (this.turnSequence !== null && this.turnSequence !== undefined) {
      envelope.turnSequence = this.turnSequence;
    }

    return envelope;
  }

  static deserialize(data) {
    return new NarrationEvent(data);
  }

  validate() {
    super.validate();

    if (!this.content) {
      throw new Error("NarrationEvent must have content");
    }

    return true;
  }
}

export { NarrationEvent };
