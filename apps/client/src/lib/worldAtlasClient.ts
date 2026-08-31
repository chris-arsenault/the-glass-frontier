import type {
  EntityActivityFeed,
  EncyclopediaCharacterOption,
  EncyclopediaClassification,
  EncyclopediaEntrySummary,
  HardState,
  HardStateKind,
  LoreFragment,
  PlayableRole,
} from '@glass-frontier/dto';

import { atlasClient } from './atlasClient';

/**
 * World Atlas API client. Read-only: canon is written by ingest batches, not by
 * the Atlas, and is corrected by reverting a batch rather than editing a row.
 */
export const worldAtlasClient = {
  async batchGetEntities(ids: string[]): Promise<HardState[]> {
    return atlasClient.batchGetEntities.query({ ids });
  },

  async getEncyclopediaEntry(slug: string) {
    return atlasClient.getEncyclopediaEntry.query({ slug });
  },

  async getEntity(idOrSlug: string): Promise<{
    classifications: EncyclopediaClassification[];
    entity: HardState;
    fragments: LoreFragment[];
  }> {
    return atlasClient.getEntity.query({ identifier: idOrSlug });
  },

  async getEntityActivity(limitPerList = 5): Promise<EntityActivityFeed> {
    return atlasClient.getEntityActivity.query({ limitPerList });
  },

  async getNeighbors(idOrSlug: string, kind?: HardStateKind): Promise<{ entity: HardState; neighbors: HardState[] }> {
    return atlasClient.getEntityNeighbors.query({ identifier: idOrSlug, kind });
  },

  async listApplicableEncyclopediaEntries(input: {
    locationId?: string;
    locationName?: string;
  }): Promise<EncyclopediaEntrySummary[]> {
    return atlasClient.listApplicableEncyclopediaEntries.query(input);
  },

  async listEncyclopediaCharacterOptions(
    role: EncyclopediaCharacterOption['role']
  ): Promise<EncyclopediaCharacterOption[]> {
    return atlasClient.listEncyclopediaCharacterOptions.query({ role });
  },

  async listEncyclopediaEntries(filter?: {
    kind?: string;
    prevalence?: 'common' | 'uncommon' | 'rare';
    query?: string;
    subkind?: string;
    topic?: string;
  }): Promise<EncyclopediaEntrySummary[]> {
    return atlasClient.listEncyclopediaEntries.query(filter);
  },

  async listEntities(filter?: {
    kind?: HardStateKind;
    isLocation?: boolean;
    playableAs?: PlayableRole;
  }): Promise<HardState[]> {
    return atlasClient.listEntities.query({
      isLocation: filter?.isLocation,
      kind: filter?.kind,
      playableAs: filter?.playableAs,
    });
  },
};
