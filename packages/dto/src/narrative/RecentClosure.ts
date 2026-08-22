import { z } from 'zod';

/**
 * One row of the landing page's recently-closed feed: what a chronicle looked
 * like when it ended, across all players. The hook is the closer's
 * chronicle_story summary and is null until that summary lands.
 */
export const RecentClosure = z.object({
  characterName: z.string().min(1).nullable(),
  closedAt: z.number().int().nonnegative(),
  hook: z.string().min(1).nullable(),
  id: z.string().min(1),
  locationName: z.string().min(1),
  title: z.string().min(1),
});

export type RecentClosure = z.infer<typeof RecentClosure>;
