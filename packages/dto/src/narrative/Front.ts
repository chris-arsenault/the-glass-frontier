import { z } from 'zod';

/**
 * A thing the world is doing that the player did not start.
 *
 * Every event in a chronicle used to be a reaction to a verb the player
 * supplied — the piston jams when she fires it, the vortex opens when she
 * accelerates. Nothing held an intention across turns, so nothing could arrive
 * on its own schedule. A front is that intention: someone in canon wants
 * something, a clock measures how close they are to getting it, and when the
 * clock fills it happens whether or not the player was looking.
 *
 * A front changes the situation, never the resolution. The player's stated
 * action always does exactly what they said; what a firing front changes is
 * what the world looks like when they are done.
 */
export const Front = z.object({
  /** The canon entity pursuing this, by slug. Fronts are never invented whole. */
  agentSlug: z.string().min(1),
  /** Segments filled so far. At `size`, the front fires. */
  filled: z.number().int().nonnegative().default(0),
  id: z.string().min(1),
  /** What the agent is trying to bring about, in one line. */
  intent: z.string().min(1),
  /** What the player would notice next if they were paying attention. */
  nextSign: z.string().min(1),
  /** How many segments this takes. Bigger clocks are slower, heavier arrivals. */
  size: z.number().int().positive(),
  startedAtTurn: z.number().int().nonnegative(),
  /**
   * `active` while it advances, `fired` on the turn its clock filled, and
   * `spent` or `abandoned` once it has landed or the fiction has invalidated
   * it. Only `active` fronts tick.
   */
  status: z.enum(['active', 'fired', 'spent', 'abandoned']).default('active'),
  updatedAtTurn: z.number().int().nonnegative(),
});
export type Front = z.infer<typeof Front>;

/** At most this many fronts live at once, so the world has intent, not weather. */
export const MAX_LIVE_FRONTS = 3;

export const isFrontLive = (front: Front): boolean => front.status === 'active';
