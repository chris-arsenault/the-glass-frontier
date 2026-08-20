import { z } from 'zod';

import { HardStateKind } from './HardState';

export const LoreFragmentSource = z.object({
  beatId: z.string().min(1).optional(),
  chronicleId: z.string().min(1).optional(),
  entityKind: HardStateKind.optional(),
});

export const LoreFragment = z.object({
  entityId: z.string().min(1),
  id: z.string().min(1),
  prose: z.string().min(1),
  slug: z.string().min(1),
  source: LoreFragmentSource,
  tags: z.array(z.string()).default([]),
  timestamp: z
    .number()
    .int()
    .nonnegative()
    .default(() => Date.now()),
  title: z.string().min(1),
});

export type LoreFragment = z.infer<typeof LoreFragment>;
export type LoreFragmentSource = z.infer<typeof LoreFragmentSource>;
