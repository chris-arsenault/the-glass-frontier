import type { LocationEntity, LocationState } from '@glass-frontier/dto';
import type { LocationDeltaDecision } from '@glass-frontier/gm-api/gmGraph/nodes/classifiers/LocationDeltaNode';
import { isNonEmptyString, log } from '@glass-frontier/utils';

import type { GraphContext } from '../types';

export async function applyLocationUpdate(context: GraphContext): Promise<LocationState | null> {
  log('info', 'Applying Location Update');

  const characterId = context.chronicleState.chronicle.characterId;
  const delta = context.locationDelta;
  const currentLocationId =
    context.chronicleState.location?.id ?? context.chronicleState.chronicle.locationId;

  if (!isNonEmptyString(characterId) || !delta || delta.action === 'no_change') {
    return null;
  }

  if (!isNonEmptyString(currentLocationId)) {
    log('warn', 'Cannot apply location update: no current location');
    return null;
  }

  // Look up destination by name
  const destination = await findLocationByName(context, delta.destination);

  let targetPlaceId: string;

  if (destination) {
    // Move to existing location
    targetPlaceId = destination.id;
  } else {
    // Create new location with relationship
    const newPlace = await createNewLocation(context, currentLocationId, delta);
    targetPlaceId = newPlace.id;
  }

  // Move character to the target location
  return context.locationGraphStore.moveCharacterToLocation({
    characterId,
    placeId: targetPlaceId,
  });
}

async function findLocationByName(
  context: GraphContext,
  name: string
): Promise<LocationEntity | null> {
  const currentLocationId =
    context.chronicleState.location?.id ?? context.chronicleState.chronicle.locationId;

  if (!isNonEmptyString(currentLocationId)) {
    return null;
  }

  try {
    const neighbors = await context.locationGraphStore.getLocationNeighbors({
      id: currentLocationId,
      minProminence: 'recognized',
      maxHops: 2,
    });

    const normalizedName = normalizeName(name);
    for (const entries of Object.values(neighbors)) {
      for (const entry of entries) {
        if (normalizeName(entry.neighbor.name) === normalizedName) {
          return entry.neighbor;
        }
      }
    }
  } catch (error) {
    log('error', 'Error finding location by name', { error });
  }

  return null;
}

async function createNewLocation(
  context: GraphContext,
  anchorId: string,
  delta: LocationDeltaDecision
): Promise<LocationEntity> {
  const relationship = mapLinkToRelationship(delta.link);

  return context.locationGraphStore.createLocationWithRelationship({
    anchorId,
    kind: 'location',
    name: delta.destination,
    relationship,
    tags: [],
  });
}

function mapLinkToRelationship(link: LocationDeltaDecision['link']): string {
  switch (link) {
    case 'inside':
      return 'contains';
    case 'adjacent':
    case 'same':
      return 'adjacent_to';
    case 'linked':
      return 'connected_by';
    default:
      return 'related_to';
  }
}

function normalizeName(value: string): string {
  const lower = value.toLowerCase();
  const stripped = lower.replace(/[^a-z0-9]+/g, '');
  if (stripped.length > 0) {
    return stripped;
  }
  return lower.trim();
}
