import type { LocationDeltaDecision, LocationEntity } from '@glass-frontier/dto';
import { isNonEmptyString, log } from '@glass-frontier/utils';
import { randomUUID } from 'node:crypto';

import type { GraphContext } from '../types';

export async function applyLocationUpdate(context: GraphContext): Promise<LocationEntity | null> {
  log('info', 'Applying location update');
  const delta = context.locationDelta;
  if (delta === undefined || delta.action === 'no_change') {
    return null;
  }

  const destination = await findLocationByName(context, delta.destination);
  return destination ?? createSessionLocation(delta);
}

async function findLocationByName(
  context: GraphContext,
  name: string
): Promise<LocationEntity | null> {
  const currentLocation = context.chronicleState.location;
  const currentLocationId = currentLocation?.id ?? context.chronicleState.chronicle.locationId;
  if (
    !isNonEmptyString(currentLocationId) ||
    currentLocation?.status === 'session-only'
  ) {
    return null;
  }

  const neighbors = await context.locationHelpers.getNeighborsGrouped({
    id: currentLocationId,
    maxHops: 2,
    minProminence: 'recognized',
  });
  const normalizedName = normalizeName(name);
  return (
    Object.values(neighbors)
      .flat()
      .find((entry) => normalizeName(entry.neighbor.name) === normalizedName)?.neighbor ?? null
  );
}

const createSessionLocation = (delta: LocationDeltaDecision): LocationEntity => {
  const id = randomUUID();
  const timestamp = Date.now();
  return {
    createdAt: timestamp,
    id,
    kind: 'location',
    name: delta.destination.trim(),
    prominence: 'recognized',
    slug: `session-${id}`,
    status: 'session-only',
    tags: [`relationship:${delta.link}`],
    updatedAt: timestamp,
  };
};

function normalizeName(value: string): string {
  const lower = value.toLowerCase();
  const stripped = lower.replace(/[^a-z0-9]+/g, '');
  return stripped.length > 0 ? stripped : lower.trim();
}
