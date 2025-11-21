import type {
  Attribute,
  Character,
  Chronicle,
  ChronicleBeat,
  Intent,
  LocationEntity,
  SkillCheckPlan,
  SkillCheckResult,
  SkillTier,
  TranscriptEntry,
  BeatTracker,
  InventoryDelta,
  LlmTrace,
  PlayerFeedbackVisibilityLevel,
} from '@glass-frontier/dto';

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error' | 'closed';
export type ChronicleLifecycle = 'open' | 'closed';
export type DirectoryStatus = 'idle' | 'loading' | 'ready' | 'error';

export type ChatMessage = {
  advancesTimeline?: boolean | null;
  entry: TranscriptEntry;
  executedNodes?: string[] | null;
  skillCheckPlan?: SkillCheckPlan | null;
  skillCheckResult?: SkillCheckResult | null;
  skillKey?: string | null;
  attributeKey?: Attribute | null;
  playerIntent?: Intent | null;
  gmSummary?: string | null;
  gmTrace?: LlmTrace | null;
  turnId?: string | null;
  turnSequence?: number | null;
  skillProgress?: SkillProgressBadge[] | null;
  inventoryDelta?: InventoryDelta | null;
  beatTracker?: BeatTracker | null;
  intentType?: Intent['intentType'] | null;
  handlerId?: string | null;
  worldDeltaTags?: string[] | null;
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

export type MomentumTrend = {
  direction: MomentumDirection;
  delta: number;
  previous: number;
  current: number;
  floor: number;
  ceiling: number;
}

export type PlayerSettings = {
  feedbackVisibility: PlayerFeedbackVisibilityLevel;
}

export type ChronicleState = {
  beats: ChronicleBeat[];
  beatsEnabled: boolean;
  focusedBeatId: string | null;
  chronicleId: string | null;
  chronicleRecord: Chronicle | null;
  playerId: string | null;
  playerName: string | null;
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
  location?: LocationEntity | null;
  availableCharacters: Character[];
  availableChronicles: Chronicle[];
  directoryStatus: DirectoryStatus;
  directoryError: Error | null;
  momentumTrend: MomentumTrend | null;
  pendingTurnJobId: string | null;
  pendingPlayerMessageId: string | null;
  recentChronicles: string[];
  playerSettings: PlayerSettings;
  playerSettingsStatus: 'idle' | 'loading' | 'ready' | 'error';
  playerSettingsError: Error | null;
  isUpdatingPlayerSettings: boolean;
}

export type ChronicleStore = {
  hydrateChronicle: (chronicleId: string) => Promise<string>;
  sendPlayerMessage: (input: { content: string }) => Promise<void>;
  setPreferredCharacterId: (characterId: string | null) => void;
  refreshPlayerResources: () => Promise<void>;
  createChronicleForCharacter: (details: ChronicleCreationDetails) => Promise<string>;
  createChronicleFromSeed: (details: ChronicleSeedCreationDetails) => Promise<string>;
  createCharacterProfile: (draft: CharacterCreationDraft) => Promise<void>;
  deleteChronicle: (chronicleId: string) => Promise<void>;
  clearActiveChronicle: () => void;
  setChronicleWrapTarget: (shouldWrap: boolean) => Promise<void>;
  resetStore: () => void;
  loadPlayerSettings: () => Promise<void>;
  updatePlayerSettings: (settings: PlayerSettings) => Promise<void>;
} & ChronicleState

export type CharacterCreationDraft = {
  name: string;
  archetype: string;
  pronouns: string;
  attributes: Character['attributes'];
  skills: Character['skills'];
}

export type ChronicleCreationDetails = {
  characterId?: string | null;
  title: string;
  locationName: string;
  locationAtmosphere: string;
  beatsEnabled?: boolean;
}

export type ChronicleSeedCreationDetails = {
  characterId?: string | null;
  locationId: string;
  title?: string | null;
  seedText: string;
  beatsEnabled?: boolean;
}
