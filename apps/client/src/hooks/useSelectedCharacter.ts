import type { Character } from '@glass-frontier/dto';
import { useMemo } from 'react';

import { useChronicleStore } from '../stores/chronicleStore';

export function useSelectedCharacter(): Character | null {
  const chronicleCharacter = useChronicleStore((state) => state.character);
  const preferredCharacterId = useChronicleStore((state) => state.preferredCharacterId);
  const availableCharacters = useChronicleStore((state) => state.availableCharacters);

  return useMemo(() => {
    if (chronicleCharacter) {
      return chronicleCharacter;
    }
    if (!preferredCharacterId) {
      return null;
    }
    return availableCharacters.find((character) => character.id === preferredCharacterId) ?? null;
  }, [availableCharacters, chronicleCharacter, preferredCharacterId]);
}
