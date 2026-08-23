import { z } from 'zod';

import { HardStateKind, HardStateSubkind } from './HardState';

/** One entity row in a player-facing world activity feed. */
export const EntityActivityItem = z.object({
  activityAt: z.number().int().nonnegative(),
  id: z.string().min(1),
  kind: HardStateKind,
  name: z.string().min(1),
  slug: z.string().min(1),
  subkind: HardStateSubkind.nullable(),
  summary: z.string().nullable(),
});

/** An entity whose newest activity is a lore fragment added after creation. */
export const EntityLoreActivityItem = EntityActivityItem.extend({
  loreTitle: z.string().min(1),
});

export const EntityActivityFeed = z.object({
  created: z.array(EntityActivityItem),
  loreUpdated: z.array(EntityLoreActivityItem),
});

export type EntityActivityItem = z.infer<typeof EntityActivityItem>;
export type EntityLoreActivityItem = z.infer<typeof EntityLoreActivityItem>;
export type EntityActivityFeed = z.infer<typeof EntityActivityFeed>;
