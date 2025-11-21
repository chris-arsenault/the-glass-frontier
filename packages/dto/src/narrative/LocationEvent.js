import { z } from 'zod';
export const LocationEvent = z.object({
    chronicleId: z.string().min(1),
    createdAt: z.number().int().nonnegative(),
    id: z.string().min(1),
    locationId: z.string().min(1),
    metadata: z.record(z.string(), z.unknown()).optional(),
    scope: z.string().min(1).optional(),
    summary: z.string().min(1),
});
export const LocationEventDraft = z.object({
    chronicleId: z.string().min(1),
    metadata: z.record(z.string(), z.unknown()).optional(),
    scope: z.string().min(1).optional(),
    summary: z.string().min(1),
});
