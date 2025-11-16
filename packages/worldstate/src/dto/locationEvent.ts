import { z } from 'zod';

import { MetadataSchema } from './shared';

export const LocationEventSchema = z.object({
  id: z.string().min(1),
  locationId: z.string().min(1),
  chronicleId: z.string().min(1),
  summary: z.string().min(1),
  scope: z.string().min(1).optional(),
  metadata: MetadataSchema.optional(),
  createdAt: z.string().datetime(),
});

export type LocationEvent = z.infer<typeof LocationEventSchema>;
