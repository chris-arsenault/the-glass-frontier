import type {
  Attribute,
  Character,
  CharacterDraft,
  Chronicle,
  ChronicleBeat,
  Intent,
  SceneContext,
  SkillCheckPlan,
  SkillCheckResult,
  SkillTier,
  TranscriptEntry,
  BeatTracker,
  InventoryDelta,
  LlmTrace,
  PlayerFeedbackVisibilityLevel,
  EntityReference,
  EntityRosterEntry,
  ProseAlternate,
} from '@glass-frontier/dto';

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error' | 'closed';
export type ChronicleLifecycle = 'open' | 'closed';
export type DirectoryStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * One transcript entry. Turn-level data lives in the TurnView keyed by
 * `turnKey`, so the several sources that deliver a turn (history, progress feed
 * preview, tRPC response) update one record instead of every message.
 */
export type ChatMessage = {
  entry: TranscriptEntry;
  /** Key into ChronicleState.turnViews; null for entries outside any turn. */
  turnKey: string | null;
}

export type TurnView = {
  advancesTimeline: boolean | null;
  attributeKey: Attribute | null;
  beatTracker: BeatTracker | null;
  entityReferences: EntityReference[] | null;
  entityRoster: EntityRosterEntry[] | null;
  executedNodes: string[] | null;
  gmSummary: string | null;
  gmTrace: LlmTrace | null;
  intentType: Intent['intentType'] | null;
  inventoryDelta: InventoryDelta | null;
  playerIntent: Intent | null;
  proseAlternates: ProseAlternate[] | null;
  proseCostUsd: number | null;
  sceneContext: SceneContext | null;
  skillCheckPlan: SkillCheckPlan | null;
  skillCheckResult: SkillCheckResult | null;
  skillKey: string | null;
  skillProgress: SkillProgressBadge[] | null;
  turnId: string | null;
  turnSequence: number | null;
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

export type TurnProgress = {
  nodeId: string;
  status: 'start' | 'success' | 'error';
  step: number;
  total: number;
};

export type ChronicleState = {
  beats: ChronicleBeat[];
  focusedBeatId: string | null;
  chronicleId: string | null;
  chronicleRecord: Chronicle | null;
  playerId: string | null;
  playerName: string | null;
  preferredCharacterId: string | null;
  messages: ChatMessage[];
  /** Turn-level data shared by that turn's messages, keyed by turn id or jobId. */
  turnViews: Record<string, TurnView>;
  turnSequence: number;
  connectionState: ConnectionState;
  transportError: Error | null;
  isSending: boolean;
  /** Live pipeline position for the in-flight turn, from progress events. */
  turnProgress: TurnProgress | null;
  chronicleStatus: ChronicleLifecycle;
  character?: Character | null;
  /** Where the scene is, as the GM last named it. */
  locationName: string | null;
  /** The canon place the chronicle started from, if it started from one. */
  locationId: string | null;
  /** Slug of that canon place, for the Atlas link while still there. */
  locationSlug: string | null;
  /** Name of that canon place, to detect that play is still there. */
  startLocationName: string | null;
  availableCharacters: Character[];
  availableChronicles: Chronicle[];
  directoryStatus: DirectoryStatus;
  directoryError: Error | null;
  momentumTrend: MomentumTrend | null;
  pendingTurnJobId: string | null;
  pendingPlayerMessageId: string | null;
  playerSettings: PlayerSettings;
  playerSettingsStatus: 'idle' | 'loading' | 'ready' | 'error';
  playerSettingsError: Error | null;
  isUpdatingPlayerSettings: boolean;
  selectedEntityIds: string[];
}

export type ChronicleStore = {
  hydrateChronicle: (chronicleId: string) => Promise<string>;
  sendPlayerMessage: (input: { content: string }) => Promise<void>;
  setPreferredCharacterId: (characterId: string | null) => void;
  refreshPlayerResources: () => Promise<void>;
  createChronicleFromSeed: (details: ChronicleSeedCreationDetails) => Promise<string>;
  createCharacterProfile: (draft: CharacterDraft) => Promise<void>;
  deleteChronicle: (chronicleId: string) => Promise<void>;
  clearActiveChronicle: () => void;
  setChronicleWrapTarget: (shouldWrap: boolean) => Promise<void>;
  resetStore: () => void;
  loadPlayerSettings: () => Promise<void>;
  updatePlayerSettings: (settings: PlayerSettings) => Promise<void>;
  toggleEntityTarget: (entityId: string) => void;
} & ChronicleState

export type ChronicleSeedCreationDetails = {
  anchorEntityId?: string | null;
  characterId?: string | null;
  locationId: string;
  locationName: string;
  title?: string | null;
  seedText: string;
  toneChips?: string[];
  toneNotes?: string;
}
