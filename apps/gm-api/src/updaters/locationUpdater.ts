import {
  SESSION_ONLY_STATUS,
  type LocationEntity,
  type SessionLocation,
  type SessionLocationChain,
} from '@glass-frontier/dto';
import { isNonEmptyString, log } from '@glass-frontier/utils';
import { randomUUID } from 'node:crypto';

import type { GraphContext } from '../types';

export type LocationUpdate = {
  location: LocationEntity;
  discoveredLocations: SessionLocationChain;
};

const normalizeName = (value: string): string => {
  const lower = value.toLowerCase();
  const stripped = lower.replace(/[^a-z0-9]+/g, '');
  return stripped.length > 0 ? stripped : lower.trim();
};

const toLocationEntity = (discovered: SessionLocation): LocationEntity => ({
  createdAt: discovered.visitedAt,
  description: discovered.description,
  id: discovered.id,
  kind: 'location',
  name: discovered.name,
  prominence: 'recognized',
  slug: `session-${discovered.id}`,
  status: SESSION_ONLY_STATUS,
  tags: discovered.tags,
  updatedAt: discovered.visitedAt,
});

/**
 * Resolves where the player just moved to.
 *
 * Canon first, then places already discovered this chronicle, then a new
 * discovery. Nothing here writes to the graph: a discovered place lives in
 * chronicle session state with the step that reached it, which is what lets the
 * GM keep its bearings off-graph and lets the player walk back the way they came.
 */
export async function applyLocationUpdate(
  context: GraphContext
): Promise<LocationUpdate | null> {
  log('info', 'Applying location update');
  const delta = context.locationDelta;
  if (delta === undefined || delta.action === 'no_change') {
    return null;
  }

  const discovered = context.chronicleState.discoveredLocations ?? [];
  const canonical = await findCanonNeighbor(context, delta.destination);
  if (canonical !== null) {
    return { discoveredLocations: discovered, location: canonical };
  }

  const revisited = findDiscovered(discovered, delta.destination);
  if (revisited !== null) {
    return { discoveredLocations: discovered, location: toLocationEntity(revisited) };
  }

  const current = context.chronicleState.location;
  const record: SessionLocation = {
    description: undefined,
    id: randomUUID(),
    name: delta.destination.trim(),
    reachedFrom: {
      id: current.id,
      isCanon: current.status !== SESSION_ONLY_STATUS,
      name: current.name,
    },
    relationship: delta.link,
    tags: [],
    visitedAt: Date.now(),
  };
  return {
    discoveredLocations: [...discovered, record],
    location: toLocationEntity(record),
  };
}

/**
 * Places reachable from a discovered location: where it was reached from, and
 * anywhere reached from it. This is what the prompt shows instead of nothing.
 */
export function sessionNeighbors(
  discovered: SessionLocationChain,
  locationId: string
): Array<{ relationship: string; name: string; id: string; direction: 'in' | 'out' }> {
  const here = discovered.find((entry) => entry.id === locationId);
  const outward =
    here === undefined
      ? []
      : [{
        direction: 'out' as const,
        id: here.reachedFrom.id,
        name: here.reachedFrom.name,
        relationship: here.relationship,
      }];
  const inward = discovered
    .filter((entry) => entry.reachedFrom.id === locationId)
    .map((entry) => ({
      direction: 'in' as const,
      id: entry.id,
      name: entry.name,
      relationship: entry.relationship,
    }));
  return [...outward, ...inward];
}

async function findCanonNeighbor(
  context: GraphContext,
  name: string
): Promise<LocationEntity | null> {
  const currentLocation = context.chronicleState.location;
  const anchorId =
    currentLocation.status === SESSION_ONLY_STATUS
      ? nearestCanonAnchor(context)
      : (currentLocation.id ?? context.chronicleState.chronicle.locationId);
  if (!isNonEmptyString(anchorId)) {
    return null;
  }
  const neighbors = await context.locationHelpers.getNeighborsGrouped({
    id: anchorId,
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

/**
 * Walks the discovery chain back to the last canon location, so a player who
 * has wandered off-graph is still matched against real neighbours.
 */
function nearestCanonAnchor(context: GraphContext): string | undefined {
  const discovered = context.chronicleState.discoveredLocations ?? [];
  const byId = new Map(discovered.map((entry) => [entry.id, entry]));
  let cursor = context.chronicleState.location.id;
  const guard = new Set<string>();
  while (isNonEmptyString(cursor) && !guard.has(cursor)) {
    guard.add(cursor);
    const entry = byId.get(cursor);
    if (entry === undefined) {
      return cursor;
    }
    if (entry.reachedFrom.isCanon) {
      return entry.reachedFrom.id;
    }
    cursor = entry.reachedFrom.id;
  }
  return context.chronicleState.chronicle.locationId;
}

function findDiscovered(
  discovered: SessionLocationChain,
  name: string
): SessionLocation | null {
  const normalizedName = normalizeName(name);
  return discovered.find((entry) => normalizeName(entry.name) === normalizedName) ?? null;
}
