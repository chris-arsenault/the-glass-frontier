/**
 * Envelope for check resolution results
 * Corresponds to: event.checkResolved, check.result
 */
export class CheckResult extends BaseEnvelope {
    static deserialize(data: any): CheckResult;
    constructor(data: any);
    checkId: any;
    result: any;
    move: any;
    ability: any;
    dice: any;
    difficulty: any;
    momentum: any;
    momentumDelta: any;
    momentumReset: any;
    statAdjustments: any[];
    inventoryDelta: any;
    auditRef: any;
    capabilityRefs: any[];
    safetyFlags: any[];
    source: any;
    actor: any;
    timestamp: any;
    serialize(): {
        type: string;
        id: any;
        result: any;
        move: any;
        ability: any;
        auditRef: any;
        source: any;
        actor: any;
        timestamp: any;
    };
}
import { BaseEnvelope } from "./BaseEnvelope.js";
//# sourceMappingURL=CheckResult.d.ts.map