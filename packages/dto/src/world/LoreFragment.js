import { z } from 'zod';
import { HardStateKind } from './HardState';
export const LoreFragmentSource = z.object({
    chronicleId: z.string().min(1).optional(),
    beatId: z.string().min(1).optional(),
    entityKind: HardStateKind.optional(),
});
export const LoreFragment = z.object({
    id: z.string().min(1),
    entityId: z.string().min(1),
    source: LoreFragmentSource,
    title: z.string().min(1),
    prose: z.string().min(1),
    tags: z.array(z.string()).default([]),
    timestamp: z
        .number()
        .int()
        .nonnegative()
        .default(() => Date.now()),
});
