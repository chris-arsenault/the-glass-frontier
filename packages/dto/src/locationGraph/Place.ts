import { z } from 'zod';
import { Metadata } from '../Metadata';

export const LocationPlace = z.object({
  id: z.string().min(1),
  locationId: z.string().min(1),
  name: z.string().min(1),
  kind: z.string().min(1),
  tags: z.array(z.string()).default([]),
  description: z.string().optional(),
  canonicalParentId: z.string().optional(),
  metadata: Metadata.optional(),
  createdAt: z
    .number()
    .int()
    .nonnegative()
    .default(() => Date.now()),
});

export type LocationPlace = z.infer<typeof LocationPlace>;
