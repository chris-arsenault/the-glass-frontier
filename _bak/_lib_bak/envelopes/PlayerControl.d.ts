/**
 * Envelope for player control commands
 * Corresponds to: player.control
 */
export class PlayerControl extends BaseEnvelope {
    static deserialize(data: any): PlayerControl;
    constructor(data: any);
    controlId: any;
    sessionId: any;
    controlType: any;
    turns: any;
    metadata: any;
    submittedAt: any;
    serialize(): {
        type: string;
        id: any;
        sessionId: any;
        controlType: any;
        submittedAt: any;
    };
}
import { BaseEnvelope } from "./BaseEnvelope.js";
//# sourceMappingURL=PlayerControl.d.ts.map