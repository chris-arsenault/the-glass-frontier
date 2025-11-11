/**
 * Envelope for moderation decisions
 * Corresponds to: moderation.decision
 */
export class ModerationDecision extends BaseEnvelope {
    static deserialize(data: any): ModerationDecision;
    constructor(data: any);
    decisionId: any;
    alertId: any;
    sessionId: any;
    action: any;
    status: any;
    notes: any;
    actor: any;
    metadata: any;
    createdAt: any;
    serialize(): {
        type: string;
        id: any;
        alertId: any;
        sessionId: any;
        action: any;
        status: any;
        createdAt: any;
    };
}
import { BaseEnvelope } from "./BaseEnvelope.js";
//# sourceMappingURL=ModerationDecision.d.ts.map