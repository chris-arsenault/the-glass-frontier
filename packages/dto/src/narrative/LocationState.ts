import { z } from 'zod';

export const LocationDeltaDecision = z.object({
  action: z.enum(['no_change', 'move']),
  destination: z.string().min(1),
  link: z.enum(['same', 'adjacent', 'inside', 'linked']),
});

export type LocationDeltaDecision = z.infer<typeof LocationDeltaDecision>;

export const LocationState = z.object({
  characterId: z.string().min(1),
  locationId: z.string().min(1),
  note: z.string().optional(),
  updatedAt: z
    .number()
    .int()
    .nonnegative()
    .default(() => Date.now()),
});

export type LocationState = z.infer<typeof LocationState>;
