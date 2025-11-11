"use strict";

/**
 * Represents momentum state with history
 */
class Momentum {
  constructor(data = {}) {
    this.current = typeof data.current === "number" ? data.current : 0;
    this.floor = typeof data.floor === "number" ? data.floor : -6;
    this.ceiling = typeof data.ceiling === "number" ? data.ceiling : 10;
    this.history = Array.isArray(data.history)
      ? data.history.map(entry => ({ ...entry }))
      : [];
  }

  serialize() {
    return {
      current: this.current,
      floor: this.floor,
      ceiling: this.ceiling,
      history: this.history.map(entry => ({ ...entry }))
    };
  }

  static deserialize(data) {
    return new Momentum(data);
  }

  /**
   * Apply a delta to the current momentum value
   * @param {number} delta - Amount to change
   * @param {string} reason - Reason for change
   * @param {Object} metadata - Additional metadata
   * @returns {Object} - { before, after, delta, clamped }
   */
  applyDelta(delta, reason = "momentum-adjustment", metadata = {}) {
    const before = this.current;
    const unclamped = before + delta;
    const after = Math.max(this.floor, Math.min(this.ceiling, unclamped));
    const actualDelta = after - before;
    const clamped = unclamped !== after;

    if (actualDelta !== 0) {
      this.current = after;
      this.history.push({
        before,
        after,
        delta: actualDelta,
        reason,
        at: new Date().toISOString(),
        ...metadata
      });

      // Keep history bounded
      if (this.history.length > 100) {
        this.history = this.history.slice(-100);
      }
    }

    return {
      before,
      after,
      delta: actualDelta,
      clamped
    };
  }

  /**
   * Reset momentum to a specific value
   * @param {number} value - New value
   * @param {string} reason - Reason for reset
   * @param {Object} metadata - Additional metadata
   * @returns {Object} - { before, after, delta }
   */
  reset(value, reason = "momentum-reset", metadata = {}) {
    const before = this.current;
    const after = Math.max(this.floor, Math.min(this.ceiling, value));
    const delta = after - before;

    if (delta !== 0) {
      this.current = after;
      this.history.push({
        before,
        after,
        delta,
        reason,
        at: new Date().toISOString(),
        ...metadata
      });

      if (this.history.length > 100) {
        this.history = this.history.slice(-100);
      }
    }

    return { before, after, delta };
  }

  /**
   * Get recent history entries
   * @param {number} limit - Maximum number of entries
   * @returns {Array} Recent history
   */
  getRecentHistory(limit = 20) {
    return this.history.slice(-limit);
  }

  validate() {
    if (typeof this.current !== "number" || !Number.isFinite(this.current)) {
      throw new Error("Momentum.current must be a finite number");
    }

    if (typeof this.floor !== "number" || !Number.isFinite(this.floor)) {
      throw new Error("Momentum.floor must be a finite number");
    }

    if (typeof this.ceiling !== "number" || !Number.isFinite(this.ceiling)) {
      throw new Error("Momentum.ceiling must be a finite number");
    }

    if (this.floor >= this.ceiling) {
      throw new Error("Momentum.floor must be less than ceiling");
    }

    if (!Array.isArray(this.history)) {
      throw new Error("Momentum.history must be an array");
    }

    return true;
  }

  clone() {
    return new Momentum(this.serialize());
  }
}

export { Momentum };
