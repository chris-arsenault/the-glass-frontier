"use strict";

import { BaseEnvelope } from "./BaseEnvelope.js";

/**
 * Envelope for marker events
 * Corresponds to: session.marker
 */
class MarkerEvent extends BaseEnvelope {
  constructor(data) {
    super(data.type || "session.marker", data, {
      id: data.id,
      markers: data.markers,
      turnSequence: data.turnSequence
    });

    this.markerId = data.id || data.marker || `marker-${Date.now()}`;
    this.marker = data.marker || "generic";
    this.timestamp = data.timestamp || new Date().toISOString();
    this.receivedAt = data.receivedAt || null;
    this.metadata = data.metadata ? { ...data.metadata } : {};
  }

  serialize() {
    const envelope = {
      type: this.type,
      id: this.markerId,
      marker: this.marker,
      timestamp: this.timestamp
    };

    if (this.receivedAt) {
      envelope.receivedAt = this.receivedAt;
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
    return new MarkerEvent(data);
  }

  validate() {
    super.validate();

    if (!this.marker) {
      throw new Error("MarkerEvent must have a marker");
    }

    return true;
  }
}

export { MarkerEvent };
