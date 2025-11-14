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
  PendingEquip,
  InventoryDelta,
  LlmTrace,
} from '@glass-frontier/dto';

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error' | 'closed';
export type ChronicleLifecycle = 'open' | 'closed';
export type DirectoryStatus = 'idle' | 'loading' | 'ready' | 'error';

export type ChatMessage = {
  entry: TranscriptEntry;
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

export type ChronicleState = {
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
  availableCharacters: Character[];
  availableChronicles: Chronicle[];
  directoryStatus: DirectoryStatus;
  directoryError: Error | null;
  momentumTrend: MomentumTrend | null;
  pendingTurnJobId: string | null;
  pendingPlayerMessageId: string | null;
  pendingEquip: PendingEquip[];
}

export type ChronicleStore = {
  hydrateChronicle: (chronicleId: string) => Promise<string>;
  sendPlayerMessage: (input: { content: string }) => Promise<void>;
  setPreferredCharacterId: (characterId: string | null) => void;
  refreshLoginResources: () => Promise<void>;
  createChronicleForCharacter: (details: ChronicleCreationDetails) => Promise<string>;
  createChronicleFromSeed: (details: ChronicleSeedCreationDetails) => Promise<string>;
  createCharacterProfile: (draft: CharacterCreationDraft) => Promise<void>;
  deleteChronicle: (chronicleId: string) => Promise<void>;
  queueEquipChange: (entry: PendingEquip) => void;
  clearPendingEquipQueue: () => void;
  clearActiveChronicle: () => void;
  resetStore: () => void;
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
}

export type ChronicleSeedCreationDetails = {
  characterId?: string | null;
  locationId: string;
  title?: string | null;
  seedText: string;
}
