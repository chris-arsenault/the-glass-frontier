import { log } from '@glass-frontier/utils';

import type { GraphContext } from '../types';

/**
 * Where the scene is now.
 *
 * The classifier answers one question — did we move, and what is the place
 * called — and this records the name. No lookup, no matching against canon, no
 * creation: canon is written only by an ingest batch, and the GM's world
 * knowledge arrives through the entity context slice.
 */
export function resolveLocationName(context: GraphContext): string {
  const delta = context.locationDelta;
  if (delta === undefined || delta.action === 'no_change') {
    return context.chronicleState.locationName;
  }
  const destination = delta.destination.trim();
  if (destination.length === 0) {
    return context.chronicleState.locationName;
  }
  log('info', 'Chronicle moved', { destination });
  return destination;
}
