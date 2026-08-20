import { z } from 'zod';

import { HardStateProminence } from './HardState';

/**
 * LocationEntity represents a location in the world.
 * This consolidates the previous LocationEntity and LocationEntity types.
 */
export const LocationEntity = z.object({
  createdAt: z
    .number()
    .int()
    .nonnegative(),
  description: z.string().optional(),
  id: z.string().min(1),
  kind: z.literal('location'),
  name: z.string().min(1),
  prominence: HardStateProminence.default('recognized'),
  slug: z.string().min(1),
  status: z.string().optional(),
  subkind: z.string().optional(),
  tags: z.array(z.string()).default([]),
  updatedAt: z
    .number()
    .int()
    .nonnegative(),
});

export type LocationEntity = z.infer<typeof LocationEntity>;
