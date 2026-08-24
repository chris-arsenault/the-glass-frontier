import type { Character, Chronicle } from '@glass-frontier/dto';

export const ensureInventory = (character: Character): Character => {
  if (character.inventory !== undefined) {
    return character;
  }
  return {
    ...character,
    inventory: [],
  };
};

export const initialEntityRoster = (
  locationName: string,
  roster?: Chronicle['entityRoster']
): Chronicle['entityRoster'] =>
  roster ?? {
    entries: [],
    locationName,
    sceneId: null,
    updatedAtTurn: 0,
  };

/** Close-time dispositions apply only to beats that are still open. */
export const applyBeatDispositions = (
  beats: Chronicle['beats'],
  statusByBeatId: Map<string, 'abandoned' | 'failed' | 'succeeded'>,
  now: number
): { beats: Chronicle['beats']; changed: boolean } => {
  let changed = false;
  const next = beats.map((beat) => {
    const status = statusByBeatId.get(beat.id);
    if (status === undefined || beat.status !== 'in_progress') {
      return beat;
    }
    changed = true;
    return { ...beat, resolvedAt: now, status, updatedAt: now };
  });
  return { beats: next, changed };
};

export const normalizeChronicle = (chronicle: Chronicle): Chronicle => {
  const beats = Array.isArray(chronicle.beats) ? chronicle.beats : [];
  const summaries = Array.isArray(chronicle.summaries) ? chronicle.summaries : [];
  return {
    ...chronicle,
    activeScene: chronicle.activeScene ?? null,
    beats,
    entityRoster: chronicle.entityRoster,
    sceneLedger: chronicle.sceneLedger ?? null,
    summaries,
  };
};
