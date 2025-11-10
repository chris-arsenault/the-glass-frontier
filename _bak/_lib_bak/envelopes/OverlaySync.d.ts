/**
 * Envelope for character overlay synchronization
 * Corresponds to: overlay.characterSync
 */
export class OverlaySync extends BaseEnvelope {
    static deserialize(data: any): OverlaySync;
    constructor(data: any);
    revision: any;
    character: any;
    inventory: any;
    momentum: any;
    pendingOfflineReconcile: boolean;
    lastSyncedAt: any;
    serialize(): {
        type: string;
        revision: any;
        pendingOfflineReconcile: boolean;
        lastSyncedAt: any;
    };
}
import { BaseEnvelope } from "./BaseEnvelope.js";
//# sourceMappingURL=OverlaySync.d.ts.map