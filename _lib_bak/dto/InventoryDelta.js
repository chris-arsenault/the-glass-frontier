"use strict";

import { InventoryItem  } from "./InventoryItem.js";

/**
 * Represents a delta operation for inventory changes
 */
class InventoryDelta {
  constructor(data = {}) {
    this.add = Array.isArray(data.add)
      ? data.add.map(item => InventoryItem.normalize(item)).filter(Boolean)
      : [];

    this.remove = Array.isArray(data.remove)
      ? data.remove.map(item => {
          if (typeof item === "string") {
            return { id: item };
          }
          if (item && typeof item === "object") {
            return {
              id: item.id,
              quantity: typeof item.quantity === "number" ? item.quantity : undefined
            };
          }
          return null;
        }).filter(Boolean)
      : [];

    this.update = Array.isArray(data.update)
      ? data.update.map(item => item && typeof item === "object" ? { ...item } : null).filter(Boolean)
      : [];

    this.action = data.action || "inventory-update";
    this.reason = data.reason || null;
    this.narration = data.narration || null;
  }

  serialize() {
    const delta = {
      action: this.action
    };

    if (this.add.length > 0) {
      delta.add = this.add.map(item => item.serialize());
    }

    if (this.remove.length > 0) {
      delta.remove = this.remove;
    }

    if (this.update.length > 0) {
      delta.update = this.update;
    }

    if (this.reason) {
      delta.reason = this.reason;
    }

    if (this.narration) {
      delta.narration = this.narration;
    }

    return delta;
  }

  static deserialize(data) {
    return new InventoryDelta(data);
  }

  isEmpty() {
    return this.add.length === 0 && this.remove.length === 0 && this.update.length === 0;
  }

  /**
   * Apply this delta to an inventory array
   * @param {Array} inventory - Array of inventory items
   * @returns {Object} - { changed: boolean, summary: { added: [], removed: [], updated: [] } }
   */
  applyTo(inventory) {
    if (!Array.isArray(inventory)) {
      throw new Error("Inventory must be an array");
    }

    const byId = new Map(inventory.map(entry => [entry.id, entry]));
    let changed = false;
    const summary = {
      added: [],
      removed: [],
      updated: []
    };

    // Process additions
    this.add.forEach(item => {
      const existing = byId.get(item.id);
      if (existing) {
        let localChanged = false;

        if (typeof item.quantity === "number") {
          const currentQty = typeof existing.quantity === "number" ? existing.quantity : 0;
          const nextQty = currentQty + item.quantity;
          if (nextQty !== currentQty) {
            existing.quantity = nextQty;
            localChanged = true;
          }
        }

        if (item.tags.length > 0) {
          const existingTags = Array.isArray(existing.tags) ? existing.tags : [];
          const nextTags = Array.from(new Set([...existingTags, ...item.tags]));
          if (nextTags.length !== existingTags.length) {
            existing.tags = nextTags;
            localChanged = true;
          }
        }

        if (localChanged) {
          summary.updated.push({ id: item.id, mode: "stacked" });
          changed = true;
        }
      } else {
        inventory.push(item.serialize());
        byId.set(item.id, item.serialize());
        summary.added.push(item.id);
        changed = true;
      }
    });

    // Process removals
    this.remove.forEach(removal => {
      const targetId = removal.id;
      const existing = byId.get(targetId);

      if (!existing) {
        return;
      }

      if (typeof removal.quantity === "number" && typeof existing.quantity === "number") {
        const remaining = existing.quantity - removal.quantity;
        if (remaining > 0) {
          existing.quantity = remaining;
          summary.updated.push({ id: targetId, mode: "consumed", quantity: remaining });
          changed = true;
          return;
        }
      }

      const index = inventory.findIndex(entry => entry.id === targetId);
      if (index >= 0) {
        inventory.splice(index, 1);
        byId.delete(targetId);
        summary.removed.push(targetId);
        changed = true;
      }
    });

    // Process updates
    this.update.forEach(update => {
      if (!update || !update.id) {
        return;
      }

      const existing = byId.get(update.id);
      if (!existing) {
        return;
      }

      const patch = update.patch || update;
      let localChanged = false;

      if (typeof patch.quantity === "number" && Number.isFinite(patch.quantity)) {
        if (existing.quantity !== patch.quantity) {
          existing.quantity = patch.quantity;
          localChanged = true;
        }
      }

      if (typeof patch.name === "string" && patch.name.trim().length > 0) {
        const trimmed = patch.name.trim();
        if (existing.name !== trimmed) {
          existing.name = trimmed;
          localChanged = true;
        }
      }

      if (Array.isArray(patch.tags)) {
        const nextTags = Array.from(new Set(patch.tags.map(tag => String(tag).trim()).filter(Boolean)));
        const currentTags = Array.isArray(existing.tags) ? existing.tags : [];
        const same = nextTags.length === currentTags.length &&
          nextTags.every((tag, index) => tag === currentTags[index]);
        if (!same) {
          existing.tags = nextTags;
          localChanged = true;
        }
      }

      if (typeof patch.description === "string") {
        const trimmed = patch.description.trim();
        if (existing.description !== trimmed) {
          existing.description = trimmed;
          localChanged = true;
        }
      }

      if (localChanged) {
        summary.updated.push({ id: update.id, mode: "patched" });
        changed = true;
      }
    });

    return { changed, summary };
  }

  validate() {
    if (!Array.isArray(this.add)) {
      throw new Error("InventoryDelta.add must be an array");
    }

    if (!Array.isArray(this.remove)) {
      throw new Error("InventoryDelta.remove must be an array");
    }

    if (!Array.isArray(this.update)) {
      throw new Error("InventoryDelta.update must be an array");
    }

    return true;
  }
}

export { InventoryDelta };
