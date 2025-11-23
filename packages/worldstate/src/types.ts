import type {
  Character,
  Chronicle,
  HardState,
  HardStateProminence,
  HardStateKind,
  HardStateLink,
  HardStateStatus,
  HardStateSubkind,
  LocationEntity,
  LocationNeighbors,
  LocationState,
  Turn,
  LoreFragment,
  WorldKind,
  WorldRelationshipRule,
  WorldRelationshipType,
  WorldSchema,
} from '@glass-frontier/dto';

export type WorldNeighbor = {
  relationship: string;
  direction: 'out' | 'in';
  hops: 1 | 2;
  neighbor: HardState;
  via?: { id: string; relationship: string; direction: 'out' | 'in' };
};

export type ChronicleSnapshot = {
  chronicleId: string;
  turnSequence: number;
  chronicle: Chronicle;
  character: Character | null;
  location: LocationEntity | null;
  turns: Turn[];
};

export type ChronicleStore = {
  ensureChronicle: (params: {
    chronicleId?: string;
    playerId: string;
    locationId: string;
    characterId?: string;
    title?: string;
    status?: Chronicle['status'];
    seedText?: string | null;
    beatsEnabled?: boolean;
    anchorEntityId?: string | null;
  }) => Promise<Chronicle>;

  getChronicleState: (chronicleId: string) => Promise<ChronicleSnapshot | null>;

  upsertCharacter: (character: Character) => Promise<Character>;
  getCharacter: (characterId: string) => Promise<Character | null>;
  listCharactersByPlayer: (playerId: string) => Promise<Character[]>;

  upsertChronicle: (chronicle: Chronicle) => Promise<Chronicle>;
  getChronicle: (chronicleId: string) => Promise<Chronicle | null>;
  listChroniclesByPlayer: (playerId: string) => Promise<Chronicle[]>;
  deleteChronicle: (chronicleId: string) => Promise<void>;

  addTurn: (turn: Turn) => Promise<Turn>;
  listChronicleTurns: (chronicleId: string) => Promise<Turn[]>;

  moveCharacterToLocation: (input: {
    characterId: string;
    locationId: string;
    note?: string | null;
  }) => Promise<{ characterId: string; locationId: string; note?: string; updatedAt: number }>;
};

export type WorldSchemaStore = {
  // === Entity Operations ===
  upsertEntity: (input: {
    id?: string;
    kind: HardStateKind;
    subkind?: HardStateSubkind | null;
    name: string;
    description?: string | null;
    prominence?: HardStateProminence | null;
    status?: HardStateStatus | null;
    links?: Array<{ relationship: string; targetId: string }>;
  }) => Promise<HardState>;
  getEntity: (input: { id: string }) => Promise<HardState | null>;
  getEntityBySlug: (input: { slug: string }) => Promise<HardState | null>;
  listEntities: (input?: {
    kind?: HardStateKind;
    limit?: number;
    minProminence?: HardStateProminence;
    maxProminence?: HardStateProminence;
  }) => Promise<HardState[]>;
  deleteEntity: (input: { id: string }) => Promise<void>;

  // === Relationship Operations ===
  upsertRelationship: (input: { srcId: string; dstId: string; relationship: string }) => Promise<void>;
  deleteRelationship: (input: { srcId: string; dstId: string; relationship: string }) => Promise<void>;

  // === Generic Neighbor Queries ===
  listNeighbors: (input: {
    id: string;
    kind?: HardStateKind;
    minProminence?: HardStateProminence;
    maxProminence?: HardStateProminence;
    maxHops?: number;
    limit?: number;
  }) => Promise<WorldNeighbor[]>;

  // === Schema Operations ===
  getWorldSchema: () => Promise<WorldSchema>;
  upsertKind: (input: {
    id: HardStateKind;
    category?: string | null;
    displayName?: string | null;
    defaultStatus?: HardStateStatus | null;
    subkinds?: HardStateSubkind[];
    statuses?: HardStateStatus[];
  }) => Promise<WorldKind>;
  addRelationshipType: (input: { id: string; description?: string | null }) => Promise<WorldRelationshipType>;
  upsertRelationshipRule: (input: WorldRelationshipRule) => Promise<void>;
  deleteRelationshipRule: (input: WorldRelationshipRule) => Promise<void>;

  // === Lore Operations ===
  createLoreFragment: (input: {
    id?: string;
    entityId: string;
    source: { chronicleId?: string; beatId?: string };
    title: string;
    prose: string;
    tags?: string[];
    timestamp?: number;
  }) => Promise<LoreFragment>;
  getLoreFragment: (input: { id: string }) => Promise<LoreFragment | null>;
  listLoreFragmentsByEntity: (input: { entityId: string; limit?: number }) => Promise<LoreFragment[]>;
  updateLoreFragment: (input: {
    id: string;
    title?: string;
    prose?: string;
    tags?: string[];
    source?: { chronicleId?: string; beatId?: string };
  }) => Promise<LoreFragment>;
  deleteLoreFragment: (input: { id: string }) => Promise<void>;
};
