"use strict";

import { BaseEnvelope } from "./BaseEnvelope.js";

/**
 * Envelope for check requests
 * Corresponds to: intent.checkRequest, check.prompt
 */
class CheckRequest extends BaseEnvelope {
  constructor(data) {
    super(data.type || "check.prompt", data, {
      id: data.id,
      markers: data.markers,
      turnSequence: data.turnSequence
    });

    this.checkId = data.id;
    this.auditRef = data.auditRef || null;

    // Check data
    this.data = {
      move: data.data?.move || data.move,
      ability: data.data?.ability || data.ability,
      difficulty: data.data?.difficulty || data.difficulty,
      difficultyValue: data.data?.difficultyValue || data.difficultyValue,
      rationale: data.data?.rationale || data.rationale,
      flags: data.data?.flags || [],
      safetyFlags: data.data?.safetyFlags || [],
      momentum: data.data?.momentum
    };
  }

  serialize() {
    const envelope = {
      type: this.type,
      id: this.checkId,
      auditRef: this.auditRef,
      data: this.data
    };

    if (this.markers && this.markers.length > 0) {
      envelope.markers = this.markers;
    }

    if (this.turnSequence !== null && this.turnSequence !== undefined) {
      envelope.turnSequence = this.turnSequence;
    }

    return envelope;
  }

  static deserialize(data) {
    return new CheckRequest(data);
  }

  validate() {
    super.validate();

    if (!this.checkId) {
      throw new Error("CheckRequest must have an id");
    }

    if (!this.data || !this.data.move) {
      throw new Error("CheckRequest must have data with a move");
    }

    return true;
  }
}

export { CheckRequest };
