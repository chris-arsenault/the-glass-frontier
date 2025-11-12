import type { Attribute, Character, Chronicle, LocationSummary, Turn } from '@glass-frontier/dto';

export type ChronicleSnapshot = {
  chronicleId: string;
  turnSequence: number;
  chronicle: Chronicle;
  character: Character | null;
  location: LocationSummary | null;
  turns: Turn[];
}

export type CharacterProgressPayload = {
  characterId: string;
  momentumDelta?: number;
  skill?: {
    name: string;
    attribute: Attribute;
    xpAward?: number;
  };
}
