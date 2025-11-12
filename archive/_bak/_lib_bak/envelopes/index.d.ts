import { BaseEnvelope } from "./BaseEnvelope.js";
import { AdminAlert } from "./AdminAlert.js";
import { CheckRequest } from "./CheckRequest.js";
import { CheckResult } from "./CheckResult.js";
import { HubStateEvent } from "./HubStateEvent.js";
import { MarkerEvent } from "./MarkerEvent.js";
import { ModerationDecision } from "./ModerationDecision.js";
import { NarrationEvent } from "./NarrationEvent.js";
import { OfflineJobEvent } from "./OfflineJobEvent.js";
import { OverlaySync } from "./OverlaySync.js";
import { PlayerControl } from "./PlayerControl.js";
import { SessionStatusEvent } from "./SessionStatusEvent.js";
/**
 * Factory function to deserialize envelopes based on type
 * @param {Object} data - Raw envelope data
 * @returns {BaseEnvelope} Appropriate envelope instance
 */
export function deserializeEnvelope(data: Object): BaseEnvelope;
export { BaseEnvelope, AdminAlert, CheckRequest, CheckResult, HubStateEvent, MarkerEvent, ModerationDecision, NarrationEvent, OfflineJobEvent, OverlaySync, PlayerControl, SessionStatusEvent };
//# sourceMappingURL=index.d.ts.map