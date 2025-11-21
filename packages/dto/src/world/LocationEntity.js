import { z } from 'zod';
import { HardStateProminence } from './HardState';
/**
 * LocationEntity represents a location in the world.
 * This consolidates the previous LocationEntity and LocationEntity types.
 */
export const LocationEntity = z.object({
    id: z.string().min(1),
    slug: z.string().min(1),
    name: z.string().min(1),
    kind: z.literal('location'),
    subkind: z.string().optional(),
    description: z.string().optional(),
    prominence: HardStateProminence.default('recognized'),
    status: z.string().optional(),
    tags: z.array(z.string()).default([]),
    createdAt: z
        .number()
        .int()
        .nonnegative(),
    updatedAt: z
        .number()
        .int()
        .nonnegative(),
});
