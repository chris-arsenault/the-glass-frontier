import type {
  Attribute,
  Character,
  Chronicle,
  LocationProfile,
  Turn
} from "@glass-frontier/dto";

export interface ChronicleSnapshot {
  chronicleId: string;
  turnSequence: number;
  chronicle: Chronicle;
  character: Character | null;
  location: LocationProfile | null;
  turns: Turn[];
}

export interface CharacterProgressPayload {
  characterId: string;
  momentumDelta?: number;
  skill?: {
    name: string;
    attribute: Attribute;
    xpAward?: number;
  };
}
