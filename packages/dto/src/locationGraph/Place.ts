import { z } from 'zod';

import { Metadata } from '../Metadata';

export const LocationPlace = z.object({
  canonicalParentId: z.string().optional(),
  createdAt: z
    .number()
    .int()
    .nonnegative()
    .default(() => Date.now()),
  description: z.string().optional(),
  id: z.string().min(1),
  kind: z.string().min(1),
  locationId: z.string().min(1),
  metadata: Metadata.optional(),
  name: z.string().min(1),
  tags: z.array(z.string()).default([]),
});

export type LocationPlace = z.infer<typeof LocationPlace>;
