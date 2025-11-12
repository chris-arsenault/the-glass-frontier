"use strict";

import { BaseEnvelope } from "./BaseEnvelope.js";

/**
 * Envelope for character overlay synchronization
 * Corresponds to: overlay.characterSync
 */
class OverlaySync extends BaseEnvelope {
  constructor(data) {
    super(data.type || "overlay.characterSync", data, {
      id: data.id,
      markers: data.markers,
      turnSequence: data.turnSequence
    });

    this.revision = data.revision || 0;
    this.character = data.character ? { ...data.character } : null;
    this.inventory = Array.isArray(data.inventory)
      ? data.inventory.map(item => ({ ...item }))
      : [];
    this.momentum = data.momentum ? { ...data.momentum } : null;
    this.pendingOfflineReconcile = Boolean(data.pendingOfflineReconcile);
    this.lastSyncedAt = data.lastSyncedAt || new Date().toISOString();
  }

  serialize() {
    const envelope = {
      type: this.type,
      revision: this.revision,
      pendingOfflineReconcile: this.pendingOfflineReconcile,
      lastSyncedAt: this.lastSyncedAt
    };

    if (this.character) {
      envelope.character = this.character;
    }

    if (this.inventory.length > 0) {
      envelope.inventory = this.inventory;
    }

    if (this.momentum) {
      envelope.momentum = this.momentum;
    }

    if (this.markers && this.markers.length > 0) {
      envelope.markers = this.markers;
    }

    return envelope;
  }

  static deserialize(data) {
    return new OverlaySync(data);
  }

  validate() {
    super.validate();

    if (typeof this.revision !== "number") {
      throw new Error("OverlaySync must have a numeric revision");
    }

    return true;
  }
}

export { OverlaySync };
