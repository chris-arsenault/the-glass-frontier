import type {
  Character,
  Chronicle,
  LocationEdgeKind,
  LocationEvent,
  LocationGraphSnapshot,
  LocationPlan,
  LocationPlace,
  LocationState,
  LocationSummary,
  Turn,
  Attribute,
} from '@glass-frontier/dto';

export type ChronicleSnapshot = {
  chronicleId: string;
  turnSequence: number;
  chronicle: Chronicle;
  character: Character | null;
  location: LocationSummary | null;
  turns: Turn[];
};

export type CharacterProgressPayload = {
  characterId: string;
  momentumDelta?: number;
  skill?: {
    name: string;
    attribute: Attribute;
    xpAward?: number;
  };
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

  applyCharacterProgress: (update: CharacterProgressPayload) => Promise<Character | null>;
};

export type LocationGraphStore = {
  ensureLocation: (input: {
    locationId?: string;
    name: string;
    description?: string;
    tags?: string[];
    characterId?: string;
    kind?: string;
  }) => Promise<LocationPlace>;

  getLocationGraph: (locationId: string) => Promise<LocationGraphSnapshot>;

  applyPlan: (input: {
    locationId: string;
    characterId: string;
    plan: LocationPlan;
  }) => Promise<LocationState | null>;

  getLocationState: (characterId: string) => Promise<LocationState | null>;

  summarizeCharacterLocation: (input: {
    locationId: string;
    characterId: string;
  }) => Promise<LocationSummary | null>;

  listLocationRoots: (input?: { search?: string; limit?: number }) => Promise<LocationPlace[]>;

  getPlace: (placeId: string) => Promise<LocationPlace | null>;

  createPlace: (input: {
    parentId?: string | null;
    locationId?: string;
    name: string;
    kind: string;
    tags?: string[];
    description?: string;
  }) => Promise<LocationPlace>;

  updatePlace: (input: {
    placeId: string;
    name?: string;
    kind?: string;
    description?: string | null;
    tags?: string[];
    canonicalParentId?: string | null;
  }) => Promise<LocationPlace>;

  addEdge: (input: {
    locationId: string;
    src: string;
    dst: string;
    kind: LocationEdgeKind;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;

  removeEdge: (input: {
    locationId: string;
    src: string;
    dst: string;
    kind: LocationEdgeKind;
  }) => Promise<void>;

  createLocationChain: (input: {
    parentId?: string | null;
    segments: Array<{ name: string; kind: string; tags?: string[]; description?: string }>;
  }) => Promise<{ anchor: LocationPlace; created: LocationPlace[] }>;

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
};
