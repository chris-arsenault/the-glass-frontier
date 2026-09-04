import {
  ActiveScene,
  type Character,
  type Chronicle,
  Chronicle as ChronicleSchema,
  LocalContinuity,
  NarrativeThread,
} from '@glass-frontier/dto';

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

export const normalizeChronicle = (chronicle: Chronicle): Chronicle => {
  const activeScene = ActiveScene.safeParse(chronicle.activeScene);
  const localContinuity = LocalContinuity.safeParse(chronicle.localContinuity);
  const threads = NarrativeThread.array().safeParse(chronicle.threads);
  const normalized = ChronicleSchema.parse({
    ...chronicle,
    activeScene: activeScene.success ? activeScene.data : null,
    entityRoster: chronicle.entityRoster,
    focusedThreadId: chronicle.focusedThreadId ?? null,
    localContinuity: localContinuity.success ? localContinuity.data : null,
    openingReferenceSlugs: Array.isArray(chronicle.openingReferenceSlugs)
      ? chronicle.openingReferenceSlugs
      : [],
    summaries: Array.isArray(chronicle.summaries) ? chronicle.summaries : [],
    threads: threads.success ? threads.data : [],
  });
  const focusedThreadExists = normalized.threads.some(
    (thread) => thread.id === normalized.focusedThreadId && thread.perspective === 'player'
  );
  return focusedThreadExists
    ? normalized
    : { ...normalized, focusedThreadId: null };
};
