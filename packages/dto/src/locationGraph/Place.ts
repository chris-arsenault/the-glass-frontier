import { z } from 'zod';

import { HardStateProminence } from '../world/HardState';

export const LocationPlace = z.object({
  createdAt: z
    .number()
    .int()
    .nonnegative(),
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

export type LocationPlace = z.infer<typeof LocationPlace>;
