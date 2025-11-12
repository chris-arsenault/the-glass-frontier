import { z } from 'zod';

export const LocationCertainty = z.enum(['exact', 'bounded', 'unknown']);

export const LocationState = z.object({
  anchorPlaceId: z.string().min(1),
  certainty: LocationCertainty.default('exact'),
  characterId: z.string().min(1),
  locationId: z.string().min(1),
  note: z.string().optional(),
  status: z.array(z.string()).default([]),
  updatedAt: z
    .number()
    .int()
    .nonnegative()
    .default(() => Date.now()),
});

export type LocationCertainty = z.infer<typeof LocationCertainty>;
export type LocationState = z.infer<typeof LocationState>;
