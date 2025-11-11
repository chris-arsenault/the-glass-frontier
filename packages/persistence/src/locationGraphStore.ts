import type {
  LocationGraphSnapshot,
  LocationPlan,
  LocationPlace,
  LocationState,
  LocationSummary,
} from '@glass-frontier/dto';

export interface LocationGraphStore {
  ensureLocation(input: {
    locationId?: string;
    name: string;
    description?: string;
    tags?: string[];
    characterId?: string;
    kind?: string;
  }): Promise<LocationPlace>;

  getLocationGraph(locationId: string): Promise<LocationGraphSnapshot>;

  applyPlan(input: {
    locationId: string;
    characterId: string;
    plan: LocationPlan;
  }): Promise<LocationState | null>;

  getLocationState(characterId: string): Promise<LocationState | null>;

  summarizeCharacterLocation(input: {
    locationId: string;
    characterId: string;
  }): Promise<LocationSummary | null>;
}
