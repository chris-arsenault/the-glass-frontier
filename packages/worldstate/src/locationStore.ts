import type {
  HardState,
  HardStateProminence,
  LocationNeighbors,
  LocationPlace,
  LocationState,
  WorldNeighbor,
} from '@glass-frontier/dto';

import type { LocationStore } from './types';

export const createWorldLocationStore = (options: {
  worldSchemaStore: {
    getHardState: (input: { id: string }) => Promise<HardState | null>;
    listNeighborsForKind: (
      input: {
        id: string;
        kind: HardState['kind'];
        minProminence?: HardStateProminence;
        maxProminence?: HardStateProminence;
        maxHops?: number;
        limit?: number;
      }
    ) => Promise<WorldNeighbor[]>;
    upsertHardState: (input: Parameters<LocationStore['createLocationWithRelationship']>[0]) => Promise<unknown>;
    moveCharacterToLocation: (input: {
      characterId: string;
      locationId: string;
      note?: string | null;
    }) => Promise<LocationState>;
  };
}): LocationStore => {
  const { worldSchemaStore } = options;

  return {
    async createLocationWithRelationship(input) {
      const created = await worldSchemaStore.upsertHardState({
        kind: 'location',
        name: input.name,
        description: input.description ?? undefined,
        links: [{ relationship: input.relationship, targetId: input.anchorId }],
      });
      return toPlace(created);
    },

    async getLocationDetails({
      id,
      minProminence,
      maxProminence,
      maxHops,
    }): Promise<{ place: LocationPlace; neighbors: LocationNeighbors }> {
      const base = await worldSchemaStore.getHardState({ id });
      if (!base || base.kind !== 'location') {
        throw new Error('Location not found');
      }
      const neighbors = await this.getLocationNeighbors({
        id,
        minProminence,
        maxProminence,
        maxHops,
      });
      return { place: toPlace(base), neighbors };
    },

    async getLocationNeighbors({ id, minProminence, maxProminence, maxHops }) {
      const raw = await worldSchemaStore.listNeighborsForKind({
        id,
        kind: 'location',
        minProminence,
        maxProminence,
        maxHops,
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
    },

    async moveCharacterToLocation({ characterId, placeId, note }) {
      return worldSchemaStore.moveCharacterToLocation({
        characterId,
        locationId: placeId,
        note: note ?? undefined,
      });
    },
  };
};

const toPlace = (entity: {
  id: string;
  slug: string;
  name: string;
  subkind?: string;
  status?: string;
  description?: string;
  prominence?: HardStateProminence | null;
  createdAt?: number;
  updatedAt?: number;
}): LocationPlace => ({
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
