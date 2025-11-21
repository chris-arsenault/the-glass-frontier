import type { LocationPlace, LocationState } from '@glass-frontier/dto';
import type { LocationDeltaDecision } from '@glass-frontier/gm-api/gmGraph/nodes/classifiers/LocationDeltaNode';
import { isNonEmptyString, log } from '@glass-frontier/utils';

import type { GraphContext } from '../types';

export async function applyLocationUpdate(context: GraphContext): Promise<LocationState | null> {
  log('info', 'Applying Location Update');

  const characterId = context.chronicleState.chronicle.characterId;
  const delta = context.locationDelta;
  const currentLocationId =
    context.chronicleState.location?.anchorPlaceId ?? context.chronicleState.chronicle.locationId;

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
): Promise<LocationPlace | null> {
  const currentLocationId =
    context.chronicleState.location?.anchorPlaceId ?? context.chronicleState.chronicle.locationId;

  if (!isNonEmptyString(currentLocationId)) {
    return null;
  }

  try {
    const neighbors = await context.locationGraphStore.getLocationNeighbors({
      id: currentLocationId,
      limit: 100,
    });

    const normalizedName = normalizeName(name);

    // Check parent
    if (neighbors.parent && normalizeName(neighbors.parent.name) === normalizedName) {
      return neighbors.parent;
    }

    // Check children
    for (const child of neighbors.children) {
      if (normalizeName(child.name) === normalizedName) {
        return child;
      }
    }

    // Check siblings
    for (const sibling of neighbors.siblings) {
      if (normalizeName(sibling.name) === normalizedName) {
        return sibling;
      }
    }

    // Check adjacent
    for (const adj of neighbors.adjacent) {
      if (normalizeName(adj.neighbor.name) === normalizedName) {
        return adj.neighbor;
      }
    }

    // Check links
    for (const link of neighbors.links) {
      if (normalizeName(link.neighbor.name) === normalizedName) {
        return link.neighbor;
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
): Promise<LocationPlace> {
  const relationship = mapLinkToRelationship(delta.link);
  const kind = inferKind(delta.link);

  return context.locationGraphStore.createLocationWithRelationship({
    anchorId,
    kind,
    name: delta.destination,
    relationship,
    tags: [],
  });
}

function mapLinkToRelationship(
  link: LocationDeltaDecision['link']
): 'inside' | 'adjacent' | 'linked' {
  switch (link) {
    case 'inside':
      return 'inside';
    case 'adjacent':
    case 'same':
      return 'adjacent';
    case 'linked':
      return 'linked';
    default:
      return 'adjacent';
  }
}

function inferKind(link: LocationDeltaDecision['link']): string {
  switch (link) {
    case 'inside':
      return 'room';
    case 'linked':
      return 'structure';
    default:
      return 'locale';
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
