import { z } from 'zod';

export const LoreFocus = z.object({
  entityScores: z.record(z.number()).default({}),
  tagScores: z.record(z.number()).default({}),
  lastUpdated: z.number().int().nonnegative().optional(),
});

export type LoreFocus = z.infer<typeof LoreFocus>;
