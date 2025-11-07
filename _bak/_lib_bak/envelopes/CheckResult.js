"use strict";

import { BaseEnvelope } from "./BaseEnvelope.js";

/**
 * Envelope for check resolution results
 * Corresponds to: event.checkResolved, check.result
 */
class CheckResult extends BaseEnvelope {
  constructor(data) {
    super(data.type || "check.result", data, {
      id: data.id,
      markers: data.markers,
      turnSequence: data.turnSequence
    });

    // Core check result fields
    this.checkId = data.id;
    this.result = data.result || data.tier;
    this.move = data.move || data.data?.move;
    this.ability = data.ability || data.data?.ability;

    // Dice mechanics
    this.dice = data.dice ? { ...data.dice } : null;

    // Difficulty
    this.difficulty = data.difficulty ? { ...data.difficulty } : null;

    // Momentum changes
    this.momentum = data.momentum ? { ...data.momentum } : null;
    this.momentumDelta = typeof data.momentumDelta === "number" ? data.momentumDelta : null;
    this.momentumReset = typeof data.momentumReset === "number" ? data.momentumReset : null;

    // Stat adjustments
    this.statAdjustments = Array.isArray(data.statAdjustments) ? [...data.statAdjustments] : [];

    // Inventory changes
    this.inventoryDelta = data.inventoryDelta ? { ...data.inventoryDelta } : null;

    // Metadata
    this.auditRef = data.auditRef || null;
    this.capabilityRefs = Array.isArray(data.capabilityRefs) ? [...data.capabilityRefs] : [];
    this.safetyFlags = Array.isArray(data.safetyFlags) ? [...data.safetyFlags] : [];
    this.source = data.source || "checkRunner";
    this.actor = data.actor || "checkRunner";
    this.timestamp = data.timestamp || new Date().toISOString();
  }

  serialize() {
    const envelope = {
      type: this.type,
      id: this.checkId,
      result: this.result,
      move: this.move,
      ability: this.ability,
      auditRef: this.auditRef,
      source: this.source,
      actor: this.actor,
      timestamp: this.timestamp
    };

    if (this.dice) {
      envelope.dice = this.dice;
    }

    if (this.difficulty) {
      envelope.difficulty = this.difficulty;
    }

    if (this.momentum) {
      envelope.momentum = this.momentum;
    }

    if (this.momentumDelta !== null) {
      envelope.momentumDelta = this.momentumDelta;
    }

    if (this.momentumReset !== null) {
      envelope.momentumReset = this.momentumReset;
    }

    if (this.statAdjustments.length > 0) {
      envelope.statAdjustments = this.statAdjustments;
    }

    if (this.inventoryDelta) {
      envelope.inventoryDelta = this.inventoryDelta;
    }

    if (this.capabilityRefs.length > 0) {
      envelope.capabilityRefs = this.capabilityRefs;
    }

    if (this.safetyFlags.length > 0) {
      envelope.safetyFlags = this.safetyFlags;
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
    return new CheckResult(data);
  }

  validate() {
    super.validate();

    if (!this.checkId) {
      throw new Error("CheckResult must have an id");
    }

    if (!this.result) {
      throw new Error("CheckResult must have a result");
    }

    return true;
  }
}

export { CheckResult };
