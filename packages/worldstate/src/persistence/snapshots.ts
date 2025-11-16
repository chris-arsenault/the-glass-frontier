import type { Character, Chronicle, Turn } from '../dto';

export type ChronicleSnapshotV2 = {
  chronicle: Chronicle | null;
  character: Character | null;
  turns: Turn[];
};
