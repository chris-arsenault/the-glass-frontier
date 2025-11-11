import type {
  LocationGraphSnapshot,
  LocationPlan,
  LocationPlace,
  LocationState,
  LocationSummary
} from "@glass-frontier/dto";

export interface LocationGraphStore {
  ensureChronicleRoot(input: {
    chronicleId: string;
    name: string;
    description?: string;
    tags?: string[];
    characterId: string;
    kind?: string;
  }): Promise<LocationPlace>;

  getChronicleGraph(chronicleId: string): Promise<LocationGraphSnapshot>;

  applyPlan(input: {
    chronicleId: string;
    characterId: string;
    plan: LocationPlan;
  }): Promise<LocationState | null>;

  getLocationState(characterId: string): Promise<LocationState | null>;

  summarizeCharacterLocation(input: {
    chronicleId: string;
    characterId: string;
  }): Promise<LocationSummary | null>;
}
