/**
 * Envelope for check requests
 * Corresponds to: intent.checkRequest, check.prompt
 */
export class CheckRequest extends BaseEnvelope {
    static deserialize(data: any): CheckRequest;
    constructor(data: any);
    checkId: any;
    auditRef: any;
    data: {
        move: any;
        ability: any;
        difficulty: any;
        difficultyValue: any;
        rationale: any;
        flags: any;
        safetyFlags: any;
        momentum: any;
    };
    serialize(): {
        type: string;
        id: any;
        auditRef: any;
        data: {
            move: any;
            ability: any;
            difficulty: any;
            difficultyValue: any;
            rationale: any;
            flags: any;
            safetyFlags: any;
            momentum: any;
        };
    };
}
import { BaseEnvelope } from "./BaseEnvelope.js";
//# sourceMappingURL=CheckRequest.d.ts.map