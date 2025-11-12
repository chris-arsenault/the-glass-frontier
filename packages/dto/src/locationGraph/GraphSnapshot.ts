import { z } from 'zod';

import { LocationEdge } from './Edge';
import { LocationPlace } from './Place';

export const LocationGraphSnapshot = z.object({
  edges: z.array(LocationEdge),
  locationId: z.string().min(1),
  places: z.array(LocationPlace),
});

export type LocationGraphSnapshot = z.infer<typeof LocationGraphSnapshot>;
