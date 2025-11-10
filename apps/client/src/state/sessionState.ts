import type {
  Attribute,
  Character,
  Intent,
  LocationProfile,
  SessionRecord,
  SkillCheckPlan,
  SkillCheckResult,
  TranscriptEntry
} from "@glass-frontier/dto";

export type ConnectionState = "idle" | "connecting" | "connected" | "error" | "closed";
export type SessionLifecycle = "open" | "closed";

export interface ChatMessage {
  entry: TranscriptEntry;
  skillCheckPlan?: SkillCheckPlan | null;
  skillCheckResult?: SkillCheckResult | null;
  skillKey?: string | null;
  attributeKey?: Attribute | null;
  playerIntent?: Intent | null;
}

export interface SessionState {
  sessionId: string | null;
  sessionRecord: SessionRecord | null;
  loginId: string | null;
  loginName: string | null;
  preferredCharacterId: string | null;
  messages: ChatMessage[];
  turnSequence: number;
  connectionState: ConnectionState;
  transportError: Error | null;
  isSending: boolean;
  isOffline: boolean;
  queuedIntents: number;
  sessionStatus: SessionLifecycle;
  character?: Character | null;
  location?: LocationProfile | null;
  recentSessions: string[];
}

export interface SessionStore extends SessionState {
  hydrateSession(desiredSessionId?: string): Promise<string>;
  sendPlayerMessage(input: { content: string }): Promise<void>;
  setPreferredCharacterId(characterId: string | null): void;
}
