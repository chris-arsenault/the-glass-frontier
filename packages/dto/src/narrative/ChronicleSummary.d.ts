import { z } from 'zod';
export declare const ChronicleSummaryKind: z.ZodEnum<{
    chronicle_story: "chronicle_story";
    location_events: "location_events";
    character_bio: "character_bio";
}>;
export declare const ChronicleSummaryEntry: z.ZodObject<{
    createdAt: z.ZodNumber;
    id: z.ZodString;
    kind: z.ZodEnum<{
        chronicle_story: "chronicle_story";
        location_events: "location_events";
        character_bio: "character_bio";
    }>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    summary: z.ZodString;
}, z.core.$strip>;
export type ChronicleSummaryKind = z.infer<typeof ChronicleSummaryKind>;
export type ChronicleSummaryEntry = z.infer<typeof ChronicleSummaryEntry>;
