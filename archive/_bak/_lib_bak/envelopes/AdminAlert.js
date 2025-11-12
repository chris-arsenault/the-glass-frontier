"use strict";

import { BaseEnvelope } from "./BaseEnvelope.js";

/**
 * Envelope for admin alerts
 * Corresponds to: admin.alert
 */
class AdminAlert extends BaseEnvelope {
  constructor(data) {
    super(data.type || "admin.alert", data, {
      id: data.id,
      markers: data.markers,
      turnSequence: data.turnSequence
    });

    this.alertId = data.id || `admin-alert:${data.timestamp || Date.now()}`;
    this.sessionId = data.sessionId;
    this.severity = data.severity || "info";
    this.reason = data.reason || "admin.alert";
    this.status = data.status || "live";
    this.message = data.message || this.reason || "Alert";
    this.data = data.data || null;
    this.createdAt = data.createdAt || data.timestamp || new Date().toISOString();
    this.updatedAt = data.updatedAt || this.createdAt;
  }

  serialize() {
    const envelope = {
      type: this.type,
      id: this.alertId,
      sessionId: this.sessionId,
      severity: this.severity,
      reason: this.reason,
      status: this.status,
      message: this.message,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };

    if (this.data) {
      envelope.data = this.data;
    }

    if (this.markers && this.markers.length > 0) {
      envelope.markers = this.markers;
    }

    return envelope;
  }

  static deserialize(data) {
    return new AdminAlert(data);
  }

  validate() {
    super.validate();

    if (!this.sessionId) {
      throw new Error("AdminAlert must have a sessionId");
    }

    const validSeverities = ["info", "low", "medium", "high", "critical"];
    if (!validSeverities.includes(this.severity)) {
      throw new Error(`AdminAlert severity must be one of: ${validSeverities.join(", ")}`);
    }

    return true;
  }
}

export { AdminAlert };
