import { z } from 'zod';
export declare const LocationEvent: z.ZodObject<{
    chronicleId: z.ZodString;
    createdAt: z.ZodNumber;
    id: z.ZodString;
    locationId: z.ZodString;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    scope: z.ZodOptional<z.ZodString>;
    summary: z.ZodString;
}, z.core.$strip>;
export declare const LocationEventDraft: z.ZodObject<{
    chronicleId: z.ZodString;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    scope: z.ZodOptional<z.ZodString>;
    summary: z.ZodString;
}, z.core.$strip>;
export type LocationEvent = z.infer<typeof LocationEvent>;
export type LocationEventDraft = z.infer<typeof LocationEventDraft>;
