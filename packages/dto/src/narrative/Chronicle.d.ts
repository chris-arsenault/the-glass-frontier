import { z } from 'zod';
export declare const Chronicle: z.ZodObject<{
    beats: z.ZodDefault<z.ZodArray<z.ZodObject<{
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
    }, z.core.$strip>>>;
    beatsEnabled: z.ZodDefault<z.ZodBoolean>;
    characterId: z.ZodOptional<z.ZodString>;
    id: z.ZodString;
    locationId: z.ZodString;
    playerId: z.ZodString;
    anchorEntityId: z.ZodOptional<z.ZodString>;
    entityFocus: z.ZodDefault<z.ZodObject<{
        entityScores: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodNumber>>;
        tagScores: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodNumber>>;
        lastUpdated: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    metadata: z.ZodOptional<z.ZodObject<{
        tags: z.ZodDefault<z.ZodArray<z.ZodString>>;
        timestamp: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>;
    seedText: z.ZodOptional<z.ZodString>;
    status: z.ZodDefault<z.ZodEnum<{
        open: "open";
        closed: "closed";
    }>>;
    summaries: z.ZodDefault<z.ZodArray<z.ZodObject<{
        createdAt: z.ZodNumber;
        id: z.ZodString;
        kind: z.ZodEnum<{
            chronicle_story: "chronicle_story";
            location_events: "location_events";
            character_bio: "character_bio";
        }>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        summary: z.ZodString;
    }, z.core.$strip>>>;
    targetEndTurn: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    title: z.ZodString;
}, z.core.$strip>;
export type Chronicle = z.infer<typeof Chronicle>;
