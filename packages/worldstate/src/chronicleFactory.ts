import type { Chronicle } from '@glass-frontier/dto';

import { initialEntityRoster, normalizeChronicle } from './chronicleNormalization';
import { foundingBeats } from './foundingBeat';

export type EnsureChronicleParams = {
  anchorEntityId?: string | null;
  characterId?: string;
  chronicleId?: string;
  entityRoster?: Chronicle['entityRoster'];
  locationId?: string | null;
  locationName: string;
  openingText?: string;
  openingReferenceSlugs?: Chronicle['openingReferenceSlugs'];
  playerId: string;
  seedText?: string | null;
  status?: Chronicle['status'];
  title?: string;
  toneChips?: string[];
  toneNotes?: string;
};

export const buildChronicleRecord = (
  params: EnsureChronicleParams,
  chronicleId: string
): Chronicle =>
  normalizeChronicle({
    activeScene: null,
    anchorEntityId: params.anchorEntityId ?? undefined,
    beats: foundingBeats(params.title, params.seedText),
    characterId: params.characterId,
    entityFocus: { entityScores: {}, tagScores: {} },
    entityRoster: initialEntityRoster(params.locationName, params.entityRoster),
    fronts: [],
    id: chronicleId,
    locationId: params.locationId ?? undefined,
    locationName: params.locationName,
    openingReferenceSlugs: params.openingReferenceSlugs ?? [],
    openingText: params.openingText ?? '',
    playerId: params.playerId,
    sceneLedger: null,
    seedText: params.seedText ?? undefined,
    status: params.status ?? 'open',
    summaries: [],
    title: params.title ?? 'Untitled Chronicle',
    toneChips: params.toneChips ?? [],
    toneNotes: params.toneNotes ?? '',
  });
