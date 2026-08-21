import { z } from 'zod';

/**
 * Marks a location that exists only inside one chronicle. Canon entities never
 * carry it, so it is also the test for "this place is not in the graph".
 */
export const SESSION_ONLY_STATUS = 'session-only';

/**
 * A place the GM invented mid-chronicle, and the step that reached it.
 *
 * These never touch the canon graph. They live in chronicle session state so
 * the GM keeps its bearings and the player can walk back, and they are the
 * record a close-time canon batch draws on if any of them earns a place in
 * the world.
 */
export const SessionLocation = z.object({
  description: z.string().optional(),
  id: z.string().min(1),
  name: z.string().min(1),
  /** Where the player was standing when this place was reached. */
  reachedFrom: z.object({
    id: z.string().min(1),
    /** False when the origin is itself a discovered place. */
    isCanon: z.boolean(),
    name: z.string().min(1),
  }),
  /** The move that got here, as the classifier described it. */
  relationship: z.string().min(1),
  tags: z.array(z.string()).default([]),
  visitedAt: z.number().int().nonnegative(),
});
export type SessionLocation = z.infer<typeof SessionLocation>;

export const SessionLocationChain = z.array(SessionLocation).default([]);
export type SessionLocationChain = z.infer<typeof SessionLocationChain>;
