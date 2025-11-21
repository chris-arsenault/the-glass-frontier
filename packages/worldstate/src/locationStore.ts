import type {
  HardStateProminence,
  LocationNeighbors,
  LocationEntity,
} from '@glass-frontier/dto';

import type { WorldSchemaStore, WorldNeighbor } from './types';

/**
 * LocationHelpers provides convenience methods for location-specific operations.
 * This is a thin wrapper around WorldSchemaStore for common location patterns.
 */
export class LocationHelpers {
  readonly #worldStore: WorldSchemaStore;

  constructor(worldStore: WorldSchemaStore) {
    this.#worldStore = worldStore;
  }

  /**
   * Create a location with a relationship to an anchor entity.
   * Convenience wrapper around worldStore.upsertEntity.
   */
  async createWithRelationship(input: {
    name: string;
    description?: string | null;
    anchorId: string;
    relationship: string;
    prominence?: HardStateProminence;
  }): Promise<LocationEntity> {
    const created = await this.#worldStore.upsertEntity({
      kind: 'location',
      name: input.name,
      description: input.description ?? undefined,
      prominence: input.prominence,
      links: [{ relationship: input.relationship, targetId: input.anchorId }],
    });
    return toPlace(created);
  }

  /**
   * Get location details including neighbors grouped by relationship.
   */
  async getDetails(input: {
    id: string;
    minProminence?: HardStateProminence;
    maxProminence?: HardStateProminence;
    maxHops?: number;
  }): Promise<{ place: LocationEntity; neighbors: LocationNeighbors }> {
    const base = await this.#worldStore.getEntity({ id: input.id });
    if (!base || base.kind !== 'location') {
      throw new Error('Location not found');
    }
    const neighbors = await this.getNeighborsGrouped({
      id: input.id,
      minProminence: input.minProminence,
      maxProminence: input.maxProminence,
      maxHops: input.maxHops,
    });
    return { place: toPlace(base), neighbors };
  }

  /**
   * Get location neighbors grouped by relationship type.
   * Convenience wrapper around worldStore.listNeighbors.
   */
  async getNeighborsGrouped(input: {
    id: string;
    minProminence?: HardStateProminence;
    maxProminence?: HardStateProminence;
    maxHops?: number;
    limit?: number;
  }): Promise<LocationNeighbors> {
    const raw = await this.#worldStore.listNeighbors({
      id: input.id,
      kind: 'location',
      minProminence: input.minProminence,
      maxProminence: input.maxProminence,
      maxHops: input.maxHops,
      limit: input.limit,
    });

    const grouped: LocationNeighbors = {};
    for (const entry of raw) {
      const neighborPlace = toPlace(entry.neighbor);
      const bucket = grouped[entry.relationship] ?? [];
      bucket.push({
        direction: entry.direction,
        hops: entry.hops,
        neighbor: neighborPlace,
        relationship: entry.relationship,
        via: entry.via,
      });
      grouped[entry.relationship] = bucket;
    }
    return grouped;
  }
}

const toPlace = (entity: {
  id: string;
  slug: string;
  name: string;
  description?: string;
  subkind?: string;
  status?: string;
  prominence?: HardStateProminence | null;
  createdAt?: number;
  updatedAt?: number;
}): LocationEntity => ({
  createdAt: entity.createdAt ?? Date.now(),
  id: entity.id,
  kind: 'location',
  name: entity.name,
  description: entity.description ?? undefined,
  prominence: entity.prominence ?? 'recognized',
  slug: entity.slug,
  status: entity.status ?? undefined,
  subkind: entity.subkind ?? undefined,
  tags: [],
  updatedAt: entity.updatedAt ?? Date.now(),
});
