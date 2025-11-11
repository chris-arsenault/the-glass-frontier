/**
 * Envelope for admin alerts
 * Corresponds to: admin.alert
 */
export class AdminAlert extends BaseEnvelope {
    static deserialize(data: any): AdminAlert;
    constructor(data: any);
    alertId: any;
    sessionId: any;
    severity: any;
    reason: any;
    status: any;
    message: any;
    data: any;
    createdAt: any;
    updatedAt: any;
    serialize(): {
        type: string;
        id: any;
        sessionId: any;
        severity: any;
        reason: any;
        status: any;
        message: any;
        createdAt: any;
        updatedAt: any;
    };
}
import { BaseEnvelope } from "./BaseEnvelope.js";
//# sourceMappingURL=AdminAlert.d.ts.map