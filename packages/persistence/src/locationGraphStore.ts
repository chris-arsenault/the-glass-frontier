import type {
  LocationGraphSnapshot,
  LocationPlan,
  LocationPlace,
  LocationState,
  LocationSummary,
} from '@glass-frontier/dto';

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

  createLocationChain: (input: {
    parentId?: string | null;
    segments: Array<{ name: string; kind: string; tags?: string[]; description?: string }>;
  }) => Promise<{ anchor: LocationPlace; created: LocationPlace[] }>;
}
