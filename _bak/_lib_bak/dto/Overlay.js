"use strict";

import { Character  } from "./Character.js";
import { Momentum  } from "./Momentum.js";
import { InventoryItem  } from "./InventoryItem.js";

/**
 * Represents the complete character overlay (character sheet)
 */
class Overlay {
  constructor(data = {}) {
    this.revision = typeof data.revision === "number" ? data.revision : 0;
    this.character = data.character ? new Character(data.character) : new Character();
    this.inventory = Array.isArray(data.inventory)
      ? data.inventory.map(item => InventoryItem.deserialize(item))
      : [];
    this.relationships = data.relationships ? { ...data.relationships } : {};
    this.momentum = data.momentum ? new Momentum(data.momentum) : new Momentum();
    this.capabilityReferences = Array.isArray(data.capabilityReferences)
      ? data.capabilityReferences.map(ref => ({ ...ref }))
      : [];
    this.pendingOfflineReconcile = Boolean(data.pendingOfflineReconcile);
    this.lastChangeCursor = data.lastChangeCursor || 0;
    this.lastAcknowledgedCursor = data.lastAcknowledgedCursor || 0;
    this.lastUpdatedAt = data.lastUpdatedAt || null;
    this.lastSyncedAt = data.lastSyncedAt || new Date().toISOString();
  }

  serialize() {
    return {
      revision: this.revision,
      character: this.character.serialize(),
      inventory: this.inventory.map(item => item.serialize()),
      relationships: { ...this.relationships },
      momentum: this.momentum.serialize(),
      capabilityReferences: this.capabilityReferences.map(ref => ({ ...ref })),
      pendingOfflineReconcile: this.pendingOfflineReconcile,
      lastChangeCursor: this.lastChangeCursor,
      lastAcknowledgedCursor: this.lastAcknowledgedCursor,
      lastUpdatedAt: this.lastUpdatedAt,
      lastSyncedAt: this.lastSyncedAt
    };
  }

  static deserialize(data) {
    return new Overlay(data);
  }

  /**
   * Get an inventory item by ID
   * @param {string} itemId - Item ID
   * @returns {InventoryItem|null} Item or null
   */
  getInventoryItem(itemId) {
    return this.inventory.find(item => item.id === itemId) || null;
  }

  /**
   * Add an item to inventory
   * @param {InventoryItem|Object} item - Item to add
   */
  addInventoryItem(item) {
    const normalized = item instanceof InventoryItem
      ? item
      : InventoryItem.normalize(item);

    if (!normalized) {
      throw new Error("Invalid inventory item");
    }

    this.inventory.push(normalized);
  }

  /**
   * Remove an item from inventory
   * @param {string} itemId - Item ID to remove
   * @returns {boolean} True if removed
   */
  removeInventoryItem(itemId) {
    const index = this.inventory.findIndex(item => item.id === itemId);
    if (index >= 0) {
      this.inventory.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Increment the revision number
   */
  incrementRevision() {
    this.revision += 1;
    this.lastUpdatedAt = new Date().toISOString();
  }

  validate() {
    if (typeof this.revision !== "number") {
      throw new Error("Overlay.revision must be a number");
    }

    this.character.validate();
    this.momentum.validate();

    for (const item of this.inventory) {
      if (!(item instanceof InventoryItem)) {
        throw new Error("All inventory items must be InventoryItem instances");
      }
      item.validate();
    }

    return true;
  }

  clone() {
    return new Overlay(this.serialize());
  }
}

export { Overlay };
