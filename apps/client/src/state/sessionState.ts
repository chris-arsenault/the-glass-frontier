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
export type DirectoryStatus = "idle" | "loading" | "ready" | "error";

export interface ChatMessage {
  entry: TranscriptEntry;
  skillCheckPlan?: SkillCheckPlan | null;
  skillCheckResult?: SkillCheckResult | null;
  skillKey?: string | null;
  attributeKey?: Attribute | null;
  playerIntent?: Intent | null;
  gmSummary?: string | null;
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
  availableCharacters: Character[];
  availableSessions: SessionRecord[];
  directoryStatus: DirectoryStatus;
  directoryError: Error | null;
}

export interface SessionStore extends SessionState {
  hydrateSession(sessionId: string): Promise<string>;
  sendPlayerMessage(input: { content: string }): Promise<void>;
  setPreferredCharacterId(characterId: string | null): void;
  refreshLoginResources(): Promise<void>;
  createSessionForCharacter(details: SessionCreationDetails): Promise<string>;
  createCharacterProfile(draft: CharacterCreationDraft): Promise<void>;
  clearActiveSession(): void;
  resetStore(): void;
}

export interface CharacterCreationDraft {
  name: string;
  archetype: string;
  pronouns: string;
  attributes: Character["attributes"];
  skills: Character["skills"];
}

export interface SessionCreationDetails {
  characterId?: string | null;
  title: string;
  locationName: string;
  locationAtmosphere: string;
}
