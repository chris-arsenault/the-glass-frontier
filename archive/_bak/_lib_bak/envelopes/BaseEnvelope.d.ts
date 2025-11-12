/**
 * Base class for all envelope types that are transmitted between client and server.
 * Envelopes contain a type field and a payload, and can include metadata like markers.
 */
export class BaseEnvelope {
    /**
     * Deserialize a plain object into an envelope instance
     * @param {Object} data - Plain object from wire
     * @returns {BaseEnvelope} Envelope instance
     */
    static deserialize(data: Object): BaseEnvelope;
    /**
     * @param {string} type - The envelope type (e.g., "check.result")
     * @param {Object} payload - The envelope payload
     * @param {Object} options - Additional envelope options
     * @param {Array} options.markers - Optional markers array
     * @param {number} options.turnSequence - Optional turn sequence number
     * @param {string} options.id - Optional envelope ID
     */
    constructor(type: string, payload?: Object, options?: {
        markers: any[];
        turnSequence: number;
        id: string;
    });
    type: string;
    payload: Object;
    id: string | null;
    markers: any[];
    turnSequence: number | null;
    /**
     * Serialize this envelope to a plain object for transmission over the wire
     * @returns {Object} Plain object representation
     */
    serialize(): Object;
    /**
     * Validate envelope structure
     * @returns {boolean} True if valid
     * @throws {Error} If validation fails
     */
    validate(): boolean;
}
//# sourceMappingURL=BaseEnvelope.d.ts.map