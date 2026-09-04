import type {
  CanonProposal,
  CanonSource,
  Character,
  Chronicle,
  ChronicleActivity,
  ChronicleSummaryEntry,
  CommitBatchResult,
  ContextSliceEntity,
  EntityActivityFeed,
  EncyclopediaCharacterRole,
  EncyclopediaClassification,
  EncyclopediaEntry,
  EncyclopediaEntrySummary,
  ContextSliceInput,
  HardState,
  HardStateProminence,
  HardStateKind,
  LiveRelationship,
  PlayableRole,
  Turn,
  LoreFragment,
  WorldSchema,
  ContextTerm,
  WorldThreadSeed,
} from '@glass-frontier/dto';

import type { TurnSearchInput, TurnWindowInput } from './chronicleTurnPersistence';
import type {
  EntityEmbeddingSource,
  EntitySearchCandidate,
  ReferenceEntityCandidate,
  SubjectEntityCandidate,
} from './entityEmbeddings';
import type { EntityStats } from './entityReader';

export type WorldNeighbor = {
  relationship: string;
  direction: 'out' | 'in';
  hops: number;
  neighbor: HardState;
  via?: { id: string; relationship: string; direction: 'out' | 'in' };
};

export type StoredEncyclopediaEntry = EncyclopediaEntry & { id: string };

export type EncyclopediaEmbeddingSource = {
  id: string;
  text: string;
};

export type EncyclopediaSearchCandidate = EncyclopediaEntrySummary & {
  similarity: number;
};

export type EncyclopediaStore = {
  getEntry: (input: {
    slug: string;
    includeDm?: boolean;
    includeShell?: boolean;
  }) => Promise<StoredEncyclopediaEntry | null>;
  getEntryById: (id: string) => Promise<StoredEncyclopediaEntry | null>;
  listEntries: (input?: {
    includeDm?: boolean;
    kind?: string;
    limit?: number;
    prevalence?: 'common' | 'uncommon' | 'rare';
    query?: string;
    status?: 'draft' | 'complete';
    subkind?: string;
    topic?: string;
  }) => Promise<StoredEncyclopediaEntry[]>;
  listApplicable: (input: { terms: ContextTerm[] }) => Promise<StoredEncyclopediaEntry[]>;
  listCharacterOptions: (
    role: EncyclopediaCharacterRole
  ) => Promise<StoredEncyclopediaEntry[]>;
  listClassificationsForEntity: (entityId: string) => Promise<EncyclopediaClassification[]>;
  listAtlasExamplesForEntry: (slug: string) => Promise<EncyclopediaClassification[]>;
  findMentionedEntries: (text: string) => Promise<StoredEncyclopediaEntry[]>;
  listMissingEmbeddings: (limit?: number) => Promise<EncyclopediaEmbeddingSource[]>;
  saveEmbedding: (id: string, embedding: number[]) => Promise<void>;
  findCandidates: (input: {
    embedding: number[];
    includeDrafts?: boolean;
    limit?: number;
  }) => Promise<EncyclopediaSearchCandidate[]>;
};

export type ChronicleSnapshot = {
  chronicleId: string;
  turnSequence: number;
  chronicle: Chronicle;
  character: Character | null;
  /** Where the chronicle is now. A name; play is the only thing that sets it. */
  locationName: string;
  turns: Turn[];
};

export type ChronicleStore = {
  ensureChronicle: (params: {
    chronicleId?: string;
    playerId: string;
    locationName: string;
    locationId?: string | null;
    characterId?: string;
    openingText?: string;
    openingReferenceSlugs?: Chronicle['openingReferenceSlugs'];
    playerGoal?: string | null;
    title?: string;
    status?: Chronicle['status'];
    seedText?: string | null;
    anchorEntityId?: string | null;
    toneChips?: string[];
    toneNotes?: string;
    entityRoster?: Chronicle['entityRoster'];
    worldThread?: WorldThreadSeed | null;
  }) => Promise<Chronicle>;

  getChronicleState: (chronicleId: string) => Promise<ChronicleSnapshot | null>;

  upsertCharacter: (character: Character) => Promise<Character>;
  getCharacter: (characterId: string) => Promise<Character | null>;
  listCharactersByPlayer: (playerId: string) => Promise<Character[]>;

  upsertChronicle: (chronicle: Chronicle) => Promise<Chronicle>;
  setChronicleTargetEnd: (
    chronicleId: string,
    targetEndTurn: number | null
  ) => Promise<Chronicle>;
  commitClosureSummary: (input: {
    character?: Character;
    chronicleId: string;
    entry: ChronicleSummaryEntry;
  }) => Promise<boolean>;
  getChronicle: (chronicleId: string) => Promise<Chronicle | null>;
  listChronicleActivity: (
    includeActive: boolean,
    limitPerStatus?: number
  ) => Promise<ChronicleActivity[]>;
  listChroniclesByPlayer: (playerId: string) => Promise<Chronicle[]>;
  branchChronicleFromTurn: (input: {
    chronicleId: string;
    playerId: string;
    turnSequence: number;
  }) => Promise<Chronicle>;
  deleteChronicle: (chronicleId: string) => Promise<void>;

  commitTurn: (input: {
    character: Character | null;
    chronicle: Chronicle;
    turn: Turn;
  }) => Promise<Turn>;
  listChronicleTurns: (chronicleId: string) => Promise<Turn[]>;
  listTurnWindow: (input: TurnWindowInput) => Promise<Turn[]>;
  searchTurns: (input: TurnSearchInput) => Promise<Turn[]>;
};

/**
 * Canon storage. One writer, several readers.
 *
 * `commitBatch` is the only way canon changes: a validated set of entities,
 * relationships, and lore committed together under a batch id. Imported
 * batches replace the prior imported snapshot; other sources add or update
 * only their declared records. `revertBatch` is the correction path. There is
 * no per-entity mutation by design.
 */
export type WorldSchemaStore = {
  // === The write surface ===
  commitBatch: (proposal: CanonProposal) => Promise<CommitBatchResult>;
  revertBatch: (batchId: string) => Promise<void>;
  findBatch: (input: {
    source: CanonSource;
    sourceId: string;
  }) => Promise<{ batchId: string } | null>;

  // === The per-turn read surface ===
  getContextSlice: (input: ContextSliceInput) => Promise<ContextSliceEntity[]>;
  listRelationshipsAmong: (input: { entityIds: string[] }) => Promise<LiveRelationship[]>;
  hasEntityEmbeddings: (kind: HardStateKind) => Promise<boolean>;
  listMissingEntityEmbeddings: (limit?: number) => Promise<EntityEmbeddingSource[]>;
  saveEntityEmbedding: (id: string, embedding: number[]) => Promise<void>;
  findSubjectCandidates: (input: {
    embedding: number[];
    focusIds: string[];
    kind: HardStateKind;
    limit?: number;
  }) => Promise<SubjectEntityCandidate[]>;
  findReferenceCandidates: (input: {
    candidateIds?: string[];
    embedding: number[];
    limit?: number;
  }) => Promise<ReferenceEntityCandidate[]>;
  findEntityCandidates: (input: {
    embedding: number[];
    limit?: number;
  }) => Promise<EntitySearchCandidate[]>;

  // === Entity reads ===
  getEntityActivity: (limitPerList?: number) => Promise<EntityActivityFeed>;
  getEntity: (input: { id: string }) => Promise<HardState | null>;
  getEntityBySlug: (input: { slug: string }) => Promise<HardState | null>;
  findLocationByName: (input: { name: string }) => Promise<HardState | null>;
  findEntitiesByName: (input: { name: string }) => Promise<HardState[]>;
  findEntitiesMentionedIn: (input: { text: string }) => Promise<HardState[]>;
  listEntityStats: (ids: string[]) => Promise<EntityStats[]>;
  listEntities: (input?: {
    dm?: boolean;
    isArticle?: boolean;
    kind?: HardStateKind;
    isLocation?: boolean;
    limit?: number;
    minProminence?: HardStateProminence;
    maxProminence?: HardStateProminence;
    playableAs?: PlayableRole;
  }) => Promise<HardState[]>;
  listEntitiesByIds: (ids: string[]) => Promise<HardState[]>;
  listFocusChoices: (input: { locationId: string }) => Promise<HardState[]>;
  listNeighbors: (input: {
    id: string;
    kind?: HardStateKind;
    minProminence?: HardStateProminence;
    maxProminence?: HardStateProminence;
    maxHops?: number;
    limit?: number;
  }) => Promise<WorldNeighbor[]>;

  // === Vocabulary (read-only; it is repo content) ===
  getWorldSchema: () => Promise<WorldSchema>;

  // === Lore reads ===
  getLoreFragment: (input: { id: string }) => Promise<LoreFragment | null>;
  listLoreFragmentsByEntity: (input: { entityId: string; limit?: number }) => Promise<LoreFragment[]>;
  listLoreFragmentsByEntities: (input: {
    entityIds: string[];
    perEntityLimit?: number;
  }) => Promise<Map<string, LoreFragment[]>>;
  listLoreFragmentsBySlugs: (input: { slugs: string[] }) => Promise<LoreFragment[]>;
  listTagsByEntities: (input: { entityIds: string[] }) => Promise<Map<string, string[]>>;
  searchLoreFragments: (input: {
    query: string;
    entityId?: string;
    limit?: number;
  }) => Promise<LoreFragment[]>;
};
