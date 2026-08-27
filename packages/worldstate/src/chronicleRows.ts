import type { Character, Chronicle, Turn } from '@glass-frontier/dto';

export type SessionStateRow = {
  last_turn_sequence: number;
};

export type CharacterRow = { inventory: Character['inventory'] | null; props: Character };

export type ChronicleRow = {
  anchor_entity_id: string | null;
  entity_focus: Chronicle['entityFocus'] | null;
  props: Chronicle;
};

export const resolveSessionTurnSequence = (
  session: SessionStateRow | undefined,
  turns: Turn[]
): number => session?.last_turn_sequence ?? turns.at(-1)?.turnSequence ?? -1;
