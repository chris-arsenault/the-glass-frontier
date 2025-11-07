"use strict";

/**
 * Represents a character with stats and metadata
 */
class Character {
  constructor(data = {}) {
    this.id = data.id || null;
    this.name = data.name || "";
    this.stats = data.stats ? { ...data.stats } : {};
    this.metadata = data.metadata ? { ...data.metadata } : {};
  }

  serialize() {
    const character = {
      stats: { ...this.stats }
    };

    if (this.id) {
      character.id = this.id;
    }

    if (this.name) {
      character.name = this.name;
    }

    if (Object.keys(this.metadata).length > 0) {
      character.metadata = this.metadata;
    }

    return character;
  }

  static deserialize(data) {
    return new Character(data);
  }

  /**
   * Get a stat value
   * @param {string} statName - Name of the stat
   * @param {number} defaultValue - Default if not found
   * @returns {number} Stat value
   */
  getStat(statName, defaultValue = 0) {
    const value = this.stats[statName];
    return typeof value === "number" ? value : defaultValue;
  }

  /**
   * Set a stat value
   * @param {string} statName - Name of the stat
   * @param {number} value - New value
   */
  setStat(statName, value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error("Stat value must be a finite number");
    }
    this.stats[statName] = value;
  }

  /**
   * Adjust a stat by a delta
   * @param {string} statName - Name of the stat
   * @param {number} delta - Amount to change
   * @returns {Object} - { before, after, delta }
   */
  adjustStat(statName, delta) {
    const before = this.getStat(statName, 0);
    const after = before + delta;
    this.stats[statName] = after;
    return { before, after, delta };
  }

  /**
   * Apply multiple stat adjustments
   * @param {Array} adjustments - Array of { stat, delta }
   * @returns {Array} Results of adjustments
   */
  applyStatAdjustments(adjustments) {
    if (!Array.isArray(adjustments)) {
      return [];
    }

    return adjustments
      .filter(adj => typeof adj?.stat === "string" && typeof adj?.delta === "number")
      .map(adj => ({
        stat: adj.stat,
        ...this.adjustStat(adj.stat, adj.delta)
      }));
  }

  validate() {
    if (this.stats && typeof this.stats !== "object") {
      throw new Error("Character.stats must be an object");
    }

    // Validate all stats are numbers
    for (const [key, value] of Object.entries(this.stats)) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`Character stat "${key}" must be a finite number`);
      }
    }

    return true;
  }

  clone() {
    return new Character(this.serialize());
  }
}

export { Character };
