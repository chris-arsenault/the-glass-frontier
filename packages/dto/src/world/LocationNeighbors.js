import { z } from 'zod';
import { LocationEntity } from './LocationEntity';
export const LocationNeighbor = z.object({
    direction: z.enum(['out', 'in']),
    hops: z.union([z.literal(1), z.literal(2)]).default(1),
    neighbor: LocationEntity,
    relationship: z.string().min(1),
    via: z
        .object({
        direction: z.enum(['out', 'in']),
        id: z.string().min(1),
        relationship: z.string().min(1),
    })
        .optional(),
});
export const LocationNeighbors = z.record(z.string().min(1), z.array(LocationNeighbor)).default({});
