import { z } from 'zod';

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
