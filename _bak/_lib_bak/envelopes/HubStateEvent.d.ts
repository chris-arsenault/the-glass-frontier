/**
 * Envelope for hub state updates
 * Corresponds to: hub.stateSnapshot, hub.stateUpdate
 */
export class HubStateEvent extends BaseEnvelope {
    static deserialize(data: any): HubStateEvent;
    static snapshot(hubId: any, roomId: any, state: any, version: any): HubStateEvent;
    constructor(data: any);
    hubId: any;
    roomId: any;
    version: any;
    state: any;
    contests: any[];
    _normalizeContests(contests: any): any[];
    serialize(): {
        type: string;
        hubId: any;
        roomId: any;
        version: any;
        state: any;
    };
}
import { BaseEnvelope } from "./BaseEnvelope.js";
//# sourceMappingURL=HubStateEvent.d.ts.map