import { z } from 'zod';

/**
 * One durable direction of travel in a Chronicle.
 *
 * Player threads record what the player is working toward and where that
 * effort currently stands. World threads record what someone other than the
 * player is pursuing and what they have already put in motion.
 */
export const NarrativeThread = z.object({
  goal: z.string().min(1),
  id: z.string().min(1),
  owner: z.string().min(1),
  perspective: z.enum(['player', 'world']),
  position: z.string().min(1),
  title: z.string().min(1),
  updatedAtTurn: z.number().int().nonnegative(),
});

export type NarrativeThread = z.infer<typeof NarrativeThread>;

/** The world agenda authored with a Chronicle seed, before persistence adds identity. */
export const WorldThreadSeed = NarrativeThread.pick({
  goal: true,
  owner: true,
  position: true,
  title: true,
});

export type WorldThreadSeed = z.infer<typeof WorldThreadSeed>;

/** Stable facts local to the current place, kept as prose rather than fields. */
export const LocalContinuity = z.object({
  locationName: z.string().min(1),
  note: z.string().min(1),
  updatedAtTurn: z.number().int().nonnegative(),
});

export type LocalContinuity = z.infer<typeof LocalContinuity>;
