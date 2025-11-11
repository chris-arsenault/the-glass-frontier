import type {
  Attribute,
  Character,
  Chronicle,
  Intent,
  LocationSummary,
  SkillCheckPlan,
  SkillCheckResult,
  SkillTier,
  TranscriptEntry,
} from '@glass-frontier/dto';

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error' | 'closed';
export type ChronicleLifecycle = 'open' | 'closed';
export type DirectoryStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ChatMessage {
  entry: TranscriptEntry;
  skillCheckPlan?: SkillCheckPlan | null;
  skillCheckResult?: SkillCheckResult | null;
  skillKey?: string | null;
  attributeKey?: Attribute | null;
  playerIntent?: Intent | null;
  gmSummary?: string | null;
  skillProgress?: SkillProgressBadge[] | null;
}

export type SkillProgressBadge =
  | {
      type: 'skill-gain';
      skill: string;
      tier: SkillTier;
      attribute?: Attribute | null;
    }
  | {
      type: 'skill-tier-up';
      skill: string;
      tier: SkillTier;
    };

export type MomentumDirection = 'up' | 'down' | 'flat';

export interface MomentumTrend {
  direction: MomentumDirection;
  delta: number;
  previous: number;
  current: number;
  floor: number;
  ceiling: number;
}

export interface ChronicleState {
  chronicleId: string | null;
  chronicleRecord: Chronicle | null;
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
  chronicleStatus: ChronicleLifecycle;
  character?: Character | null;
  location?: LocationSummary | null;
  recentChronicles: string[];
  availableCharacters: Character[];
  availableChronicles: Chronicle[];
  directoryStatus: DirectoryStatus;
  directoryError: Error | null;
  momentumTrend: MomentumTrend | null;
  pendingTurnJobId: string | null;
  pendingPlayerMessageId: string | null;
}

export interface ChronicleStore extends ChronicleState {
  hydrateChronicle(chronicleId: string): Promise<string>;
  sendPlayerMessage(input: { content: string }): Promise<void>;
  setPreferredCharacterId(characterId: string | null): void;
  refreshLoginResources(): Promise<void>;
  createChronicleForCharacter(details: ChronicleCreationDetails): Promise<string>;
  createCharacterProfile(draft: CharacterCreationDraft): Promise<void>;
  clearActiveChronicle(): void;
  resetStore(): void;
}

export interface CharacterCreationDraft {
  name: string;
  archetype: string;
  pronouns: string;
  attributes: Character['attributes'];
  skills: Character['skills'];
}

export interface ChronicleCreationDetails {
  characterId?: string | null;
  title: string;
  locationName: string;
  locationAtmosphere: string;
}
