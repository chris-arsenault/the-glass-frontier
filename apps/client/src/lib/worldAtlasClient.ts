import type { HardState, HardStateKind, LoreFragment } from '@glass-frontier/dto';

import { atlasClient } from './atlasClient';

/**
 * World Atlas API client. Read-only: canon is written by ingest batches, not by
 * the Atlas, and is corrected by reverting a batch rather than editing a row.
 */
export const worldAtlasClient = {
  async batchGetEntities(ids: string[]): Promise<HardState[]> {
    return atlasClient.batchGetEntities.query({ ids });
  },

  async getEntity(idOrSlug: string): Promise<{ entity: HardState; fragments: LoreFragment[] }> {
    return atlasClient.getEntity.query({ identifier: idOrSlug });
  },

  async getNeighbors(idOrSlug: string, kind?: HardStateKind): Promise<{ entity: HardState; neighbors: HardState[] }> {
    return atlasClient.getEntityNeighbors.query({ identifier: idOrSlug, kind });
  },

  async listEntities(filter?: { kind?: HardStateKind; isLocation?: boolean }): Promise<HardState[]> {
    return atlasClient.listEntities.query({ isLocation: filter?.isLocation, kind: filter?.kind });
  },
};
