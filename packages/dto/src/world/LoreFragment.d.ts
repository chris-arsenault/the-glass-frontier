import { z } from 'zod';
export declare const LoreFragmentSource: z.ZodObject<{
    chronicleId: z.ZodOptional<z.ZodString>;
    beatId: z.ZodOptional<z.ZodString>;
    entityKind: z.ZodOptional<z.ZodEnum<{
        location: "location";
        npc: "npc";
        ship_or_vehicle: "ship_or_vehicle";
        artifact: "artifact";
        faction: "faction";
        resource: "resource";
        magic: "magic";
        faith: "faith";
        conflict: "conflict";
        rumor: "rumor";
        law_or_edict: "law_or_edict";
    }>>;
}, z.core.$strip>;
export declare const LoreFragment: z.ZodObject<{
    id: z.ZodString;
    slug: z.ZodString;
    entityId: z.ZodString;
    source: z.ZodObject<{
        chronicleId: z.ZodOptional<z.ZodString>;
        beatId: z.ZodOptional<z.ZodString>;
        entityKind: z.ZodOptional<z.ZodEnum<{
            location: "location";
            npc: "npc";
            ship_or_vehicle: "ship_or_vehicle";
            artifact: "artifact";
            faction: "faction";
            resource: "resource";
            magic: "magic";
            faith: "faith";
            conflict: "conflict";
            rumor: "rumor";
            law_or_edict: "law_or_edict";
        }>>;
    }, z.core.$strip>;
    title: z.ZodString;
    prose: z.ZodString;
    tags: z.ZodDefault<z.ZodArray<z.ZodString>>;
    timestamp: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type LoreFragment = z.infer<typeof LoreFragment>;
export type LoreFragmentSource = z.infer<typeof LoreFragmentSource>;
