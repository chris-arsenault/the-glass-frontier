import {Turn} from "@glass-frontier/dto";

type SessionState = {
  sessionId: string;
  turns: Turn[];
  receiveTurn: (incoming: (any)) => void;
}

export { SessionState }