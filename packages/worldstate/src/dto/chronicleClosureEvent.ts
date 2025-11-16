import { z } from 'zod';

import { ChronicleSummaryKindSchema } from './chronicleSummaryEntry';

export const ChronicleClosureEventSchema = z.object({
  chronicleId: z.string().min(1),
  locationId: z.string().min(1),
  loginId: z.string().min(1),
  characterId: z.string().min(1).optional(),
  requestedAt: z.number().int().nonnegative(),
  summaryKinds: z.array(ChronicleSummaryKindSchema).nonempty(),
  turnSequence: z.number().int().nonnegative(),
});

export type ChronicleClosureEvent = z.infer<typeof ChronicleClosureEventSchema>;
