import { z } from 'zod';

/** One cross-player chronicle row in the landing page's activity feed. */
export const ChronicleActivity = z.object({
  activityAt: z.number().int().nonnegative(),
  characterName: z.string().min(1).nullable(),
  hook: z.string().min(1).nullable(),
  id: z.string().min(1),
  locationName: z.string().min(1),
  status: z.enum(['open', 'closed']),
  title: z.string().min(1),
});

export type ChronicleActivity = z.infer<typeof ChronicleActivity>;
