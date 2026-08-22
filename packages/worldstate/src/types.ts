import type {
  CanonProposal,
  CanonSource,
  Character,
  Chronicle,
  ChronicleSummaryEntry,
  CommitBatchResult,
  ContextSliceEntity,
  ContextSliceInput,
  HardState,
  HardStateProminence,
  HardStateKind,
  RecentClosure,
  Turn,
  LoreFragment,
  WorldSchema,
} from '@glass-frontier/dto';

import type {
  EntityEmbeddingSource,
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
    title?: string;
    status?: Chronicle['status'];
    seedText?: string | null;
    beatsEnabled?: boolean;
    anchorEntityId?: string | null;
    toneChips?: string[];
    toneNotes?: string;
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
  listChroniclesByPlayer: (playerId: string) => Promise<Chronicle[]>;
  listRecentClosures: (limit?: number) => Promise<RecentClosure[]>;
  deleteChronicle: (chronicleId: string) => Promise<void>;

  commitTurn: (input: {
    character: Character | null;
    chronicle: Chronicle;
    turn: Turn;
  }) => Promise<Turn>;
  listChronicleTurns: (chronicleId: string) => Promise<Turn[]>;
};

/**
 * Canon storage. One writer, several readers.
 *
 * `commitBatch` is the only way canon changes: a validated set of entities,
 * relationships, and lore committed together under a batch id. `revertBatch`
 * is the correction path. There is no per-entity mutation by design — a
 * full-object upsert cannot tell an absent link from a removed one.
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
  hasEntityEmbeddings: (kind: HardStateKind) => Promise<boolean>;
  listMissingEntityEmbeddings: (limit?: number) => Promise<EntityEmbeddingSource[]>;
  saveEntityEmbedding: (id: string, embedding: number[]) => Promise<void>;
  findSubjectCandidates: (input: {
    embedding: number[];
    focusIds: string[];
    kind: HardStateKind;
    limit?: number;
  }) => Promise<SubjectEntityCandidate[]>;

  // === Entity reads ===
  getEntity: (input: { id: string }) => Promise<HardState | null>;
  getEntityBySlug: (input: { slug: string }) => Promise<HardState | null>;
  findLocationByName: (input: { name: string }) => Promise<HardState | null>;
  findEntitiesByName: (input: { name: string }) => Promise<HardState[]>;
  listEntityStats: (ids: string[]) => Promise<EntityStats[]>;
  listEntities: (input?: {
    kind?: HardStateKind;
    isLocation?: boolean;
    limit?: number;
    minProminence?: HardStateProminence;
    maxProminence?: HardStateProminence;
  }) => Promise<HardState[]>;
  listEntitiesByIds: (ids: string[]) => Promise<HardState[]>;
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
};
