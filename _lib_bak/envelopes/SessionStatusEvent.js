"use strict";

import { BaseEnvelope } from "./BaseEnvelope.js";

/**
 * Envelope for session status changes
 * Corresponds to: session.statusChanged, session.closed
 */
class SessionStatusEvent extends BaseEnvelope {
  constructor(data) {
    super(data.type || "session.statusChanged", data, {
      id: data.id,
      markers: data.markers,
      turnSequence: data.turnSequence
    });

    this.status = data.status || "active";
    this.closedAt = data.closedAt || null;
    this.pendingOffline = Boolean(data.pendingOffline || data.pendingOfflineReconcile);
    this.cadence = data.cadence || null;
    this.auditRef = data.auditRef || null;
  }

  serialize() {
    const envelope = {
      type: this.type,
      status: this.status,
      pendingOffline: this.pendingOffline
    };

    if (this.closedAt) {
      envelope.closedAt = this.closedAt;
    }

    if (this.cadence) {
      envelope.cadence = this.cadence;
    }

    if (this.auditRef) {
      envelope.auditRef = this.auditRef;
    }

    if (this.markers && this.markers.length > 0) {
      envelope.markers = this.markers;
    }

    return envelope;
  }

  static deserialize(data) {
    return new SessionStatusEvent(data);
  }

  static closed(closedAt = null, auditRef = null) {
    return new SessionStatusEvent({
      type: "session.closed",
      status: "closed",
      closedAt: closedAt || new Date().toISOString(),
      auditRef
    });
  }

  validate() {
    super.validate();

    if (!this.status) {
      throw new Error("SessionStatusEvent must have a status");
    }

    return true;
  }
}

export { SessionStatusEvent };
