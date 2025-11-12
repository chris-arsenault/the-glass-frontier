import { z } from 'zod';

export const LocationEdgeKind = z.enum(['CONTAINS', 'ADJACENT_TO', 'DOCKED_TO', 'LINKS_TO']);

export const LocationEdge = z.object({
  createdAt: z
    .number()
    .int()
    .nonnegative()
    .default(() => Date.now()),
  dst: z.string().min(1),
  kind: LocationEdgeKind,
  locationId: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
  src: z.string().min(1),
});

export type LocationEdgeKind = z.infer<typeof LocationEdgeKind>;
export type LocationEdge = z.infer<typeof LocationEdge>;
