import type { TranscriptEntry } from "@glass-frontier/dto";

export type ConnectionState = "idle" | "connecting" | "connected" | "error" | "closed";
export type SessionLifecycle = "open" | "closed";

export interface SessionState {
  sessionId: string | null;
  messages: TranscriptEntry[];
  turnSequence: number;
  connectionState: ConnectionState;
  transportError: Error | null;
  isSending: boolean;
  isOffline: boolean;
  queuedIntents: number;
  sessionStatus: SessionLifecycle;
}

export interface SessionStore extends SessionState {
  hydrateSession(desiredSessionId?: string): Promise<string>;
  sendPlayerMessage(input: { content: string }): Promise<void>;
}
