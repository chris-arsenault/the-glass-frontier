import { z } from 'zod';

export const LocationEdgeKindSchema = z.enum([
  'CONTAINS',
  'ADJACENT_TO',
  'DOCKED_TO',
  'LINKS_TO',
]);

export type LocationEdgeKind = z.infer<typeof LocationEdgeKindSchema>;
