import type { HardState, LoreFragment } from '@glass-frontier/dto';
import { atlasClient } from './atlasClient';

/**
 * World Atlas API client - uses tRPC under the hood
 * This maintains the same interface as the old REST client for backwards compatibility
 */
export const worldAtlasClient = {
  async listEntities(kind?: string): Promise<HardState[]> {
    return atlasClient.listEntities.query({ kind });
  },

  async getEntity(idOrSlug: string): Promise<{ entity: HardState; fragments: LoreFragment[] }> {
    return atlasClient.getEntity.query({ identifier: idOrSlug });
  },

  async batchGetEntities(ids: string[]): Promise<HardState[]> {
    return atlasClient.batchGetEntities.query({ ids });
  },

  async getNeighbors(idOrSlug: string, kind?: string): Promise<{ entity: HardState; neighbors: HardState[] }> {
    return atlasClient.getEntityNeighbors.query({ identifier: idOrSlug, kind });
  },

  async upsertEntity(input: {
    id?: string;
    kind: string;
    subkind?: string | null;
    name: string;
    description?: string | null;
    status?: string | null;
    prominence?: string | null;
    links?: Array<{ relationship: string; targetId: string; strength?: number }>;
  }): Promise<HardState> {
    return atlasClient.upsertEntity.mutate({
      ...input,
      prominence: input.prominence as 'forgotten' | 'marginal' | 'recognized' | 'renowned' | 'mythic' | undefined,
    });
  },

  async upsertRelationship(input: { srcId: string; dstId: string; relationship: string; strength?: number | null }): Promise<void> {
    await atlasClient.upsertRelationship.mutate(input);
  },

  async deleteRelationship(input: { srcId: string; dstId: string; relationship: string }): Promise<void> {
    await atlasClient.deleteRelationship.mutate(input);
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

  async deleteFragment(id: string): Promise<void> {
    await atlasClient.deleteFragment.mutate({ id });
  },
};
