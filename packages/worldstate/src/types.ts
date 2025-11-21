import type {
  Character,
  Chronicle,
  HardState,
  HardStateKind,
  HardStateLink,
  HardStateStatus,
  HardStateSubkind,
  LocationBreadcrumbEntry,
  LocationEdge,
  LocationEdgeKind,
  LocationEvent,
  LocationNeighbors,
  LocationPlace,
  LocationState,
  LocationSummary,
  Turn,
  LoreFragment,
  WorldKind,
  WorldRelationshipRule,
  WorldRelationshipType,
  WorldSchema,
} from '@glass-frontier/dto';

export type ChronicleSnapshot = {
  chronicleId: string;
  turnSequence: number;
  chronicle: Chronicle;
  character: Character | null;
  location: LocationSummary | null;
  turns: Turn[];
};

export type WorldStateStore = {
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
};

export type LocationStore = {
  upsertLocation: (input: {
    id?: string;
    name: string;
    kind: string;
    description?: string | null;
    tags?: string[];
    biome?: string | null;
    parentId?: string | null;
  }) => Promise<LocationPlace>;
  deleteLocation: (input: { id: string }) => Promise<void>;

  createLocationWithRelationship: (input: {
    name: string;
    kind: string;
    description?: string | null;
    tags?: string[];
    anchorId: string;
    relationship: 'inside' | 'adjacent' | 'linked';
  }) => Promise<LocationPlace>;

  upsertEdge: (input: {
    src: string;
    dst: string;
    kind: LocationEdgeKind;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
  deleteEdge: (input: { src: string; dst: string; kind: LocationEdgeKind }) => Promise<void>;

  listLocationRoots: (input?: { search?: string; limit?: number }) => Promise<LocationPlace[]>;
  getLocationDetails: (input: { id: string }) => Promise<{
    place: LocationPlace;
    breadcrumb: LocationBreadcrumbEntry[];
    children: LocationPlace[];
    neighbors: LocationNeighbors;
  }>;
  getLocationChain: (input: { anchorId: string }) => Promise<LocationBreadcrumbEntry[]>;
  getLocationNeighbors: (input: {
    id: string;
    limit?: number;
  }) => Promise<LocationNeighbors>;

  appendLocationEvents: (input: {
    locationId: string;
    events: Array<{
      chronicleId: string;
      summary: string;
      scope?: string;
      metadata?: Record<string, unknown>;
    }>;
  }) => Promise<LocationEvent[]>;
  listLocationEvents: (input: { locationId: string }) => Promise<LocationEvent[]>;

  getLocationState: (characterId: string) => Promise<LocationState | null>;
  moveCharacterToLocation: (input: {
    characterId: string;
    placeId: string;
    certainty?: LocationState['certainty'];
    note?: string | null;
    status?: string[];
  }) => Promise<LocationState>;
  getPlace: (placeId: string) => Promise<LocationPlace | null>;
};

export type WorldSchemaStore = {
  upsertHardState: (input: {
    id?: string;
    kind: HardStateKind;
    subkind?: HardStateSubkind | null;
    name: string;
    status?: HardStateStatus | null;
    links?: Array<{ relationship: string; targetId: string }>;
  }) => Promise<HardState>;
  getHardState: (input: { id: string }) => Promise<HardState | null>;
  listHardStates: (input?: { kind?: HardStateKind; limit?: number }) => Promise<HardState[]>;
  deleteHardState: (input: { id: string }) => Promise<void>;
  upsertRelationship: (input: { srcId: string; dstId: string; relationship: string }) => Promise<void>;
  deleteRelationship: (input: { srcId: string; dstId: string; relationship: string }) => Promise<void>;
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
  getWorldSchema: () => Promise<WorldSchema>;

  createLoreFragment: (input: {
    id?: string;
    entityId: string;
    source: { chronicleId: string; beatId?: string; turnRange?: [number, number] };
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
    source?: { chronicleId?: string; beatId?: string; turnRange?: [number, number] };
  }) => Promise<LoreFragment>;
  deleteLoreFragment: (input: { id: string }) => Promise<void>;
};
