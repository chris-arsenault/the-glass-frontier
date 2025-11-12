/**
 * Envelope for marker events
 * Corresponds to: session.marker
 */
export class MarkerEvent extends BaseEnvelope {
    static deserialize(data: any): MarkerEvent;
    constructor(data: any);
    markerId: any;
    marker: any;
    timestamp: any;
    receivedAt: any;
    metadata: any;
    serialize(): {
        type: string;
        id: any;
        marker: any;
        timestamp: any;
    };
}
import { BaseEnvelope } from "./BaseEnvelope.js";
//# sourceMappingURL=MarkerEvent.d.ts.map