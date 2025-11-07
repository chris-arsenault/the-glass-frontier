"use strict";

/**
 * Represents an inventory item that can be serialized/deserialized
 */
class InventoryItem {
  constructor(data) {
    this.id = data.id;
    this.name = data.name || "";
    this.quantity = typeof data.quantity === "number" ? data.quantity : 1;
    this.tags = Array.isArray(data.tags) ? [...data.tags] : [];
    this.description = data.description || "";
    this.metadata = data.metadata ? { ...data.metadata } : {};
  }

  serialize() {
    const item = {
      id: this.id,
      name: this.name,
      quantity: this.quantity
    };

    if (this.tags.length > 0) {
      item.tags = this.tags;
    }

    if (this.description) {
      item.description = this.description;
    }

    if (Object.keys(this.metadata).length > 0) {
      item.metadata = this.metadata;
    }

    return item;
  }

  static deserialize(data) {
    return new InventoryItem(data);
  }

  static normalize(raw) {
    if (!raw || typeof raw !== "object") {
      return null;
    }

    const id = typeof raw.id === "string" && raw.id.trim().length > 0 ? raw.id.trim() : null;
    if (!id) {
      return null;
    }

    const name = typeof raw.name === "string" && raw.name.trim().length > 0
      ? raw.name.trim()
      : id;

    const tags = Array.isArray(raw.tags)
      ? Array.from(new Set(raw.tags.map(tag => String(tag).trim()).filter(Boolean)))
      : [];

    const quantity = typeof raw.quantity === "number" && Number.isFinite(raw.quantity)
      ? raw.quantity
      : 1;

    return new InventoryItem({
      id,
      name,
      quantity,
      tags,
      description: raw.description || "",
      metadata: raw.metadata || {}
    });
  }

  validate() {
    if (!this.id || typeof this.id !== "string") {
      throw new Error("InventoryItem must have a valid id");
    }

    if (typeof this.quantity !== "number" || !Number.isFinite(this.quantity)) {
      throw new Error("InventoryItem quantity must be a finite number");
    }

    if (!Array.isArray(this.tags)) {
      throw new Error("InventoryItem tags must be an array");
    }

    return true;
  }

  clone() {
    return new InventoryItem(this.serialize());
  }
}

export { InventoryItem };
