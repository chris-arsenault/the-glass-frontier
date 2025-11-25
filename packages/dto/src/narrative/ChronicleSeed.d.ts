import { z } from 'zod';
export declare const ChronicleSeedSchema: z.ZodObject<{
    id: z.ZodString;
    tags: z.ZodDefault<z.ZodArray<z.ZodString>>;
    teaser: z.ZodString;
    title: z.ZodString;
}, z.core.$strip>;
export type ChronicleSeed = z.infer<typeof ChronicleSeedSchema>;
export declare const ChronicleSeedListSchema: z.ZodObject<{
    seeds: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        tags: z.ZodDefault<z.ZodArray<z.ZodString>>;
        teaser: z.ZodString;
        title: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ChronicleSeedList = z.infer<typeof ChronicleSeedListSchema>;
