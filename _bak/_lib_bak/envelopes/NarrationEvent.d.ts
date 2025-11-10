/**
 * Envelope for narration events (messages)
 * Corresponds to: session.message, narrative.event
 */
export class NarrationEvent extends BaseEnvelope {
    static deserialize(data: any): NarrationEvent;
    constructor(data: any);
    messageId: any;
    role: any;
    content: any;
    speaker: any;
    playerId: any;
    metadata: any;
    serialize(): {
        type: string;
        id: any;
        role: any;
        content: any;
        speaker: any;
        metadata: any;
    };
}
import { BaseEnvelope } from "./BaseEnvelope.js";
//# sourceMappingURL=NarrationEvent.d.ts.map