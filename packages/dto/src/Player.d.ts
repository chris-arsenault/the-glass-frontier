import { z } from 'zod';
export declare const PLAYER_FEEDBACK_VISIBILITY_LEVELS: readonly ["none", "badges", "narrative", "all"];
export type PlayerFeedbackVisibilityLevel = (typeof PLAYER_FEEDBACK_VISIBILITY_LEVELS)[number];
export declare const PlayerPreferencesSchema: z.ZodObject<{
    feedbackVisibility: z.ZodDefault<z.ZodEnum<{
        none: "none";
        badges: "badges";
        narrative: "narrative";
        all: "all";
    }>>;
}, z.core.$strip>;
export type PlayerPreferences = z.infer<typeof PlayerPreferencesSchema>;
export declare const PlayerTemplateVariant: z.ZodObject<{
    label: z.ZodString;
    objectKey: z.ZodString;
    updatedAt: z.ZodNumber;
    variantId: z.ZodString;
}, z.core.$strip>;
export type PlayerTemplateVariant = z.infer<typeof PlayerTemplateVariant>;
export declare const PlayerTemplateSlot: z.ZodObject<{
    activeVariantId: z.ZodOptional<z.ZodString>;
    nodeId: z.ZodString;
    variants: z.ZodArray<z.ZodObject<{
        label: z.ZodString;
        objectKey: z.ZodString;
        updatedAt: z.ZodNumber;
        variantId: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type PlayerTemplateSlot = z.infer<typeof PlayerTemplateSlot>;
export declare const Player: z.ZodObject<{
    id: z.ZodString;
    username: z.ZodString;
    email: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodObject<{
        tags: z.ZodDefault<z.ZodArray<z.ZodString>>;
        timestamp: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>;
    preferences: z.ZodOptional<z.ZodObject<{
        feedbackVisibility: z.ZodDefault<z.ZodEnum<{
            none: "none";
            badges: "badges";
            narrative: "narrative";
            all: "all";
        }>>;
    }, z.core.$strip>>;
    templateOverrides: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        activeVariantId: z.ZodOptional<z.ZodString>;
        nodeId: z.ZodString;
        variants: z.ZodArray<z.ZodObject<{
            label: z.ZodString;
            objectKey: z.ZodString;
            updatedAt: z.ZodNumber;
            variantId: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type Player = z.infer<typeof Player>;
