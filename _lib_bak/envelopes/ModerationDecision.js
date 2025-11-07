"use strict";

import { BaseEnvelope } from "./BaseEnvelope.js";

/**
 * Envelope for moderation decisions
 * Corresponds to: moderation.decision
 */
class ModerationDecision extends BaseEnvelope {
  constructor(data) {
    super(data.type || "moderation.decision", data, {
      id: data.id,
      markers: data.markers,
      turnSequence: data.turnSequence
    });

    this.decisionId = data.id || `moderation-decision:${Date.now()}`;
    this.alertId = data.alertId || null;
    this.sessionId = data.sessionId;
    this.action = data.action || "acknowledge";
    this.status = data.status || "live";
    this.notes = data.notes || null;
    this.actor = data.actor || null;
    this.metadata = data.metadata ? { ...data.metadata } : {};
    this.createdAt = data.createdAt || new Date().toISOString();
  }

  serialize() {
    const envelope = {
      type: this.type,
      id: this.decisionId,
      alertId: this.alertId,
      sessionId: this.sessionId,
      action: this.action,
      status: this.status,
      createdAt: this.createdAt
    };

    if (this.notes) {
      envelope.notes = this.notes;
    }

    if (this.actor) {
      envelope.actor = this.actor;
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
    return new ModerationDecision(data);
  }

  validate() {
    super.validate();

    if (!this.sessionId) {
      throw new Error("ModerationDecision must have a sessionId");
    }

    const validActions = ["acknowledge", "approve", "reject", "escalate", "defer"];
    if (!validActions.includes(this.action)) {
      throw new Error(`ModerationDecision action must be one of: ${validActions.join(", ")}`);
    }

    return true;
  }
}

export { ModerationDecision };
