"use strict";

/**
 * Base class for all envelope types that are transmitted between client and server.
 * Envelopes contain a type field and a payload, and can include metadata like markers.
 */
class BaseEnvelope {
  /**
   * @param {string} type - The envelope type (e.g., "check.result")
   * @param {Object} payload - The envelope payload
   * @param {Object} options - Additional envelope options
   * @param {Array} options.markers - Optional markers array
   * @param {number} options.turnSequence - Optional turn sequence number
   * @param {string} options.id - Optional envelope ID
   */
  constructor(type, payload = {}, options = {}) {
    this.type = type;
    this.payload = payload;
    this.id = options.id || null;
    this.markers = options.markers || [];
    this.turnSequence = options.turnSequence !== undefined ? options.turnSequence : null;
  }

  /**
   * Serialize this envelope to a plain object for transmission over the wire
   * @returns {Object} Plain object representation
   */
  serialize() {
    const envelope = {
      type: this.type,
      payload: this.payload
    };

    if (this.id) {
      envelope.id = this.id;
    }

    if (this.markers && this.markers.length > 0) {
      envelope.markers = this.markers;
    }

    if (this.turnSequence !== null && this.turnSequence !== undefined) {
      envelope.turnSequence = this.turnSequence;
    }

    return envelope;
  }

  /**
   * Deserialize a plain object into an envelope instance
   * @param {Object} data - Plain object from wire
   * @returns {BaseEnvelope} Envelope instance
   */
  static deserialize(data) {
    if (!data || typeof data !== "object") {
      throw new Error("Invalid envelope data: must be an object");
    }

    if (!data.type || typeof data.type !== "string") {
      throw new Error("Invalid envelope: missing or invalid type field");
    }

    return new BaseEnvelope(data.type, data.payload || {}, {
      id: data.id,
      markers: data.markers,
      turnSequence: data.turnSequence
    });
  }

  /**
   * Validate envelope structure
   * @returns {boolean} True if valid
   * @throws {Error} If validation fails
   */
  validate() {
    if (!this.type || typeof this.type !== "string") {
      throw new Error("Envelope must have a type");
    }

    if (this.markers && !Array.isArray(this.markers)) {
      throw new Error("Envelope markers must be an array");
    }

    return true;
  }
}

export { BaseEnvelope };
