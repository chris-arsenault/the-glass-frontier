import type { Chronicle, WorldThreadSeed } from '@glass-frontier/dto';

import { initialEntityRoster, normalizeChronicle } from './chronicleNormalization';
import { foundingThreads } from './foundingThreads';

export type EnsureChronicleParams = {
  anchorEntityId?: string | null;
  characterId?: string;
  chronicleId?: string;
  entityRoster?: Chronicle['entityRoster'];
  locationId?: string | null;
  locationName: string;
  openingText?: string;
  openingReferenceSlugs?: Chronicle['openingReferenceSlugs'];
  playerGoal?: string | null;
  playerId: string;
  seedText?: string | null;
  status?: Chronicle['status'];
  title?: string;
  toneChips?: string[];
  toneNotes?: string;
  worldThread?: WorldThreadSeed | null;
};

export const buildChronicleRecord = (
  params: EnsureChronicleParams,
  chronicleId: string
): Chronicle => {
  const title = params.title ?? 'Untitled Chronicle';
  const threadState = foundingThreads(title, params.playerGoal, params.worldThread);
  return normalizeChronicle({
    activeScene: null,
    anchorEntityId: params.anchorEntityId ?? undefined,
    characterId: params.characterId,
    entityFocus: { entityScores: {}, tagScores: {} },
    entityRoster: initialEntityRoster(params.locationName, params.entityRoster),
    focusedThreadId: threadState.focusedThreadId,
    id: chronicleId,
    localContinuity: null,
    locationId: params.locationId ?? undefined,
    locationName: params.locationName,
    openingReferenceSlugs: params.openingReferenceSlugs ?? [],
    openingText: params.openingText ?? '',
    playerId: params.playerId,
    seedText: params.seedText ?? undefined,
    status: params.status ?? 'open',
    summaries: [],
    threads: threadState.threads,
    title,
    toneChips: params.toneChips ?? [],
    toneNotes: params.toneNotes ?? '',
  });
};
