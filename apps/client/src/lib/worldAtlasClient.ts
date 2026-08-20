import type {
  HardState,
  HardStateKind,
  HardStateProminence,
  HardStateStatus,
  HardStateSubkind,
  LoreFragment,
} from '@glass-frontier/dto';

import { atlasClient } from './atlasClient';

/**
 * World Atlas API client - uses tRPC under the hood
 * This maintains the same interface as the old REST client for backwards compatibility
 */
export const worldAtlasClient = {
  async batchGetEntities(ids: string[]): Promise<HardState[]> {
    return atlasClient.batchGetEntities.query({ ids });
  },

  async createFragment(input: {
    entityId: string;
    title: string;
    prose: string;
    chronicleId?: string;
    beatId?: string;
    tags?: string[];
  }): Promise<LoreFragment> {
    return atlasClient.createFragment.mutate(input);
  },

  async deleteFragment(id: string): Promise<void> {
    await atlasClient.deleteFragment.mutate({ id });
  },

  async deleteRelationship(input: { srcId: string; dstId: string; relationship: string }): Promise<void> {
    await atlasClient.deleteRelationship.mutate(input);
  },

  async getEntity(idOrSlug: string): Promise<{ entity: HardState; fragments: LoreFragment[] }> {
    return atlasClient.getEntity.query({ identifier: idOrSlug });
  },

  async getNeighbors(idOrSlug: string, kind?: HardStateKind): Promise<{ entity: HardState; neighbors: HardState[] }> {
    return atlasClient.getEntityNeighbors.query({ identifier: idOrSlug, kind });
  },

  async listEntities(kind?: HardStateKind): Promise<HardState[]> {
    return atlasClient.listEntities.query({ kind });
  },

  async updateFragment(input: {
    id: string;
    title?: string;
    prose?: string;
    tags?: string[];
    chronicleId?: string;
    beatId?: string;
  }): Promise<LoreFragment> {
    return atlasClient.updateFragment.mutate(input);
  },

  async upsertEntity(input: {
    id?: string;
    kind: HardStateKind;
    subkind?: HardStateSubkind;
    name: string;
    description?: string;
    status?: HardStateStatus;
    prominence?: HardStateProminence;
    links?: Array<{ relationship: string; targetId: string; strength?: number }>;
  }): Promise<HardState> {
    return atlasClient.upsertEntity.mutate(input);
  },

  async upsertRelationship(input: { srcId: string; dstId: string; relationship: string; strength?: number | null }): Promise<void> {
    await atlasClient.upsertRelationship.mutate(input);
  },
};
