import { z } from 'zod';
export declare const ChronicleBeatStatus: z.ZodEnum<{
    in_progress: "in_progress";
    succeeded: "succeeded";
    failed: "failed";
}>;
export declare const ChronicleBeat: z.ZodObject<{
    createdAt: z.ZodNumber;
    description: z.ZodString;
    id: z.ZodString;
    slug: z.ZodString;
    resolvedAt: z.ZodOptional<z.ZodNumber>;
    status: z.ZodEnum<{
        in_progress: "in_progress";
        succeeded: "succeeded";
        failed: "failed";
    }>;
    title: z.ZodString;
    updatedAt: z.ZodNumber;
}, z.core.$strip>;
export declare const IntentBeatDirective: z.ZodObject<{
    kind: z.ZodDefault<z.ZodEnum<{
        independent: "independent";
        existing: "existing";
        new: "new";
    }>>;
    summary: z.ZodString;
    targetBeatId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, z.core.$strip>;
export type ChronicleBeatStatus = z.infer<typeof ChronicleBeatStatus>;
export type ChronicleBeat = z.infer<typeof ChronicleBeat>;
export type IntentBeatDirective = z.infer<typeof IntentBeatDirective>;
export declare const BeatTrackerSchema: z.ZodObject<{
    focusBeatId: z.ZodNullable<z.ZodString>;
    newBeat: z.ZodNullable<z.ZodObject<{
        title: z.ZodString;
        description: z.ZodString;
    }, z.core.$strip>>;
    updates: z.ZodArray<z.ZodObject<{
        beatId: z.ZodString;
        changeKind: z.ZodEnum<{
            advance: "advance";
            resolve: "resolve";
        }>;
        description: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        status: z.ZodNullable<z.ZodOptional<z.ZodEnum<{
            in_progress: "in_progress";
            succeeded: "succeeded";
            failed: "failed";
        }>>>;
    }, z.core.$strip>>;
    tags: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type BeatTracker = z.infer<typeof BeatTrackerSchema>;
