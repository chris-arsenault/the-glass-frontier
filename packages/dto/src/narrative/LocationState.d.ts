import { z } from 'zod';
export declare const LocationState: z.ZodObject<{
    characterId: z.ZodString;
    locationId: z.ZodString;
    note: z.ZodOptional<z.ZodString>;
    updatedAt: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type LocationState = z.infer<typeof LocationState>;
