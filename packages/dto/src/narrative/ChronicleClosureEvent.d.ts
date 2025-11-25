import { z } from 'zod';
export declare const ChronicleClosureEventSchema: z.ZodObject<{
    characterId: z.ZodOptional<z.ZodString>;
    chronicleId: z.ZodString;
    locationId: z.ZodString;
    playerId: z.ZodString;
    requestedAt: z.ZodNumber;
    summaryKinds: z.ZodArray<z.ZodEnum<{
        chronicle_story: "chronicle_story";
        location_events: "location_events";
        character_bio: "character_bio";
    }>>;
    turnSequence: z.ZodNumber;
}, z.core.$strip>;
export type ChronicleClosureEvent = z.infer<typeof ChronicleClosureEventSchema>;
