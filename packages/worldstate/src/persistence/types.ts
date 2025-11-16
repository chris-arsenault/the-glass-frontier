import type {
  Character,
  CharacterDraft,
  CharacterSummary,
  Chronicle,
  ChronicleDraft,
  ChronicleSummary,
  Connection,
  Location,
  LocationDraft,
  LocationGraphChunk,
  LocationNeighborSummary,
  LocationPlace,
  LocationState,
  LocationSummary,
  Login,
  PageOptions,
  Turn,
} from '../dto';

export type CharacterConnection = Connection<CharacterSummary>;
export type ChronicleConnection = Connection<ChronicleSummary>;
export type ChronicleTurnConnection = Connection<Turn>;
export type LocationConnection = Connection<LocationSummary>;
export type LocationGraphChunkConnection = Connection<LocationGraphChunk>;
export type LocationNeighborConnection = Connection<LocationNeighborSummary>;

export interface WorldStateStoreV2 {
  upsertLogin(login: Login): Promise<Login>;
  getLogin(loginId: string): Promise<Login | null>;

  createCharacter(input: CharacterDraft): Promise<Character>;
  getCharacter(characterId: string): Promise<Character | null>;
  listCharacters(loginId: string, page?: PageOptions): Promise<CharacterConnection>;

  createChronicle(input: ChronicleDraft): Promise<Chronicle>;
  getChronicle(chronicleId: string): Promise<Chronicle | null>;
  listChronicles(loginId: string, page?: PageOptions): Promise<ChronicleConnection>;

  appendTurn(chronicleId: string, turn: Turn): Promise<Turn>;
  listChronicleTurns(
    chronicleId: string,
    page?: PageOptions & { chunkSize?: number }
  ): Promise<ChronicleTurnConnection>;

  batchGetChronicleSummaries(ids: string[]): Promise<Map<string, ChronicleSummary>>;

  createLocation(input: LocationDraft): Promise<LocationSummary>;
  getLocation(locationId: string): Promise<Location | null>;
  listLocations(loginId: string, page?: PageOptions): Promise<LocationConnection>;
  listLocationGraph(
    locationId: string,
    page?: PageOptions & { chunkSize?: number }
  ): Promise<LocationGraphChunkConnection>;
  updateLocationState(state: LocationState): Promise<LocationState>;
  listLocationNeighbors(
    locationId: string,
    placeId: string,
    options?: { maxDepth?: number; relationKinds?: string[]; limit?: number; cursor?: string }
  ): Promise<LocationNeighborConnection>;
  addLocationNeighborEdge(input: {
    locationId: string;
    src: LocationPlace;
    dst: LocationPlace;
    relationKind: string;
  }): Promise<void>;
  removeLocationNeighborEdge(input: {
    locationId: string;
    srcPlaceId: string;
    dstPlaceId: string;
    relationKind: string;
  }): Promise<void>;
}
