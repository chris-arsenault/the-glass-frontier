import { z } from 'zod';

import {
  HardStateFacts,
  HardStateKind,
  HardStateProminence,
  HardStateStatus,
  HardStateSubkind,
} from './HardState';

export const ContextSliceLore = z.object({
  slug: z.string().min(1),
  summary: z.string(),
  tags: z.array(z.string()).default([]),
  title: z.string().min(1),
});
export type ContextSliceLore = z.infer<typeof ContextSliceLore>;

/**
 * One entity as the GM sees it, with the reason it was chosen.
 *
 * `reach` is the weighted path cost from the focus set: 1.0 is a focus entity
 * itself, and it falls off with distance scaled by relationship strength, so a
 * defining relationship carries further than an incidental one.
 *
 * `unwritten` marks a veiled shell nothing has filled in yet — an authored hook
 * with no detail behind it, free for the GM to invent on.
 */
export const ContextSliceEntity = z.object({
  description: z.string().optional(),
  facts: HardStateFacts.default({}),
  /** Private usage guidance. Never include this object in a player response. */
  gmNotes: z.array(z.string()).default([]),
  hops: z.number().int().nonnegative(),
  id: z.string().min(1),
  kind: HardStateKind,
  lore: z.array(ContextSliceLore).default([]),
  name: z.string().min(1),
  prominence: HardStateProminence,
  reach: z.number(),
  score: z.number(),
  slug: z.string().min(1),
  status: HardStateStatus.optional(),
  subkind: HardStateSubkind.optional(),
  tags: z.array(z.string()).default([]),
  /** A veiled shell no chronicle has established anything about yet. */
  unwritten: z.boolean().default(false),
});
export type ContextSliceEntity = z.infer<typeof ContextSliceEntity>;

export const ContextSliceInput = z.object({
  anchorId: z.string().uuid().optional(),
  focusIds: z.array(z.string().uuid()).default([]),
  focusTags: z.array(z.string()).default([]),
  limit: z.number().int().min(1).max(50).default(7),
  loreLimit: z.number().int().min(0).max(10).default(2),
  maxHops: z.number().int().min(1).max(4).default(2),
  minProminence: HardStateProminence.default('recognized'),
});
export type ContextSliceInput = z.infer<typeof ContextSliceInput>;
