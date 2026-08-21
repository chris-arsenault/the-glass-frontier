import { z } from 'zod';

/**
 * The GM's answer to one question after a turn: did the scene move, and what is
 * the place called now.
 *
 * Deliberately just a name. The GM does not resolve places against the world
 * graph, create them, or reason about how they connect — canon is written only
 * by an ingest batch, and world context reaches the prompt through the entity
 * slice rather than through location traversal.
 */
export const LocationDeltaDecision = z.object({
  action: z.enum(['no_change', 'move']),
  destination: z.string().min(1),
});

export type LocationDeltaDecision = z.infer<typeof LocationDeltaDecision>;
