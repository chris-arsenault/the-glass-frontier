import type { LocationNeighbors, LocationPlace, LocationState } from '@glass-frontier/dto';
import { randomUUID } from 'node:crypto';

import type { LocationStore } from './types';

const emptyNeighbors: LocationNeighbors = {
  adjacent: [],
  children: [],
  links: [],
  parent: null,
  siblings: [],
};

const makePlace = (id: string, name: string): LocationPlace => {
  const timestamp = Date.now();
  return {
    canonicalParentId: undefined,
    createdAt: timestamp,
    description: undefined,
    id,
    kind: 'location',
    locationId: id,
    metadata: undefined,
    name,
    tags: [],
    updatedAt: timestamp,
  };
};

export const createNoopLocationStore = (): LocationStore => ({
  async createLocationWithRelationship(input) {
    // TODO: implement hard-state-backed location creation and linking
    const id = randomUUID();
    return makePlace(id, input.name);
  },
  async getLocationDetails({ id }) {
    // TODO: replace with hard-state powered neighbor graph
    const place = makePlace(id, 'Unknown Location');
    return {
      breadcrumb: [{ id, kind: place.kind, name: place.name }],
      children: [],
      neighbors: emptyNeighbors,
      place,
    };
  },
  async getLocationNeighbors() {
    // TODO: return location neighbors once locations are backed by world entities
    return emptyNeighbors;
  },
  async moveCharacterToLocation({ characterId, placeId, certainty, note, status }) {
    // TODO: persist character locations once locations are migrated to world hard state
    return {
      anchorPlaceId: placeId,
      certainty: certainty ?? 'exact',
      characterId,
      locationId: placeId,
      note: note ?? undefined,
      status: status ?? [],
      updatedAt: Date.now(),
    } as LocationState;
  },
});
