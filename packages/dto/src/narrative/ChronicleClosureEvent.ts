import { z } from 'zod';

import { ChronicleSummaryKind } from './ChronicleSummary';

export const ChronicleClosureEventSchema = z.object({
  characterId: z.string().min(1).optional(),
  chronicleId: z.string().min(1),
  locationId: z.string().min(1),
  loginId: z.string().min(1),
  requestedAt: z.number().int().nonnegative(),
  summaryKinds: z.array(ChronicleSummaryKind).nonempty(),
  turnSequence: z.number().int().nonnegative(),
});

export type ChronicleClosureEvent = z.infer<typeof ChronicleClosureEventSchema>;
