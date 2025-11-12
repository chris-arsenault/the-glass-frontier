/**
 * Envelope for session status changes
 * Corresponds to: session.statusChanged, session.closed
 */
export class SessionStatusEvent extends BaseEnvelope {
    static deserialize(data: any): SessionStatusEvent;
    static closed(closedAt?: null, auditRef?: null): SessionStatusEvent;
    constructor(data: any);
    status: any;
    closedAt: any;
    pendingOffline: boolean;
    cadence: any;
    auditRef: any;
    serialize(): {
        type: string;
        status: any;
        pendingOffline: boolean;
    };
}
import { BaseEnvelope } from "./BaseEnvelope.js";
//# sourceMappingURL=SessionStatusEvent.d.ts.map