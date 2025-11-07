import {NarrationEvent} from "../../../_lib_bak/envelopes/index.ts";

type SessionState = {
  sessionId: string;
  narrationEvents: NarrationEvent[];
  receiveEnvelope: (incoming: (any)) => void;
}

export { SessionState }