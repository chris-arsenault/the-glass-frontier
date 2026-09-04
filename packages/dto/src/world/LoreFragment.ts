import { z } from 'zod';

import { HardStateKind } from './HardState';

export const LoreFragmentSource = z.object({
  chronicleId: z.string().min(1).optional(),
  entityKind: HardStateKind.optional(),
});

export const LoreFragment = z.object({
  entityId: z.string().min(1),
  /** The owning entity's slug, so callers can name it without a uuid. */
  entitySlug: z.string().min(1),
  /**
   * Stable identity from the source world. Encodes what owns the prose:
   * `tsonu:<entry>:<section>:<n>` is an authored passage of the entry, while
   * `tsonu:<entry>:<relation>` is a one-line annotation a relationship
   * carries. Absent for lore written during play.
   */
  externalKey: z.string().min(1).optional(),
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
