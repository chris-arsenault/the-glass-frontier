import { z } from 'zod';

import { HardStateProminence } from '../world/HardState';

export const LocationSummary = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  kind: z.literal('location'),
  subkind: z.string().optional(),
  description: z.string().optional(),
  prominence: HardStateProminence.default('recognized'),
  status: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

export type LocationSummary = z.infer<typeof LocationSummary>;
