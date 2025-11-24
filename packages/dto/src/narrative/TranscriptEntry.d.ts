import { z } from 'zod';
export declare const TranscriptEntry: z.ZodObject<{
    content: z.ZodString;
    id: z.ZodString;
    metadata: z.ZodObject<{
        tags: z.ZodDefault<z.ZodArray<z.ZodString>>;
        timestamp: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>;
    role: z.ZodEnum<{
        player: "player";
        gm: "gm";
        system: "system";
    }>;
}, z.core.$strip>;
export type TranscriptEntry = z.infer<typeof TranscriptEntry>;
