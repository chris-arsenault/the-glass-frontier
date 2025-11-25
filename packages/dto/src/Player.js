import { z } from 'zod';
import { Metadata } from './Metadata';
export const PLAYER_FEEDBACK_VISIBILITY_LEVELS = ['none', 'badges', 'narrative', 'all'];
export const PlayerPreferencesSchema = z.object({
    feedbackVisibility: z.enum(PLAYER_FEEDBACK_VISIBILITY_LEVELS).default('all'),
});
export const PlayerTemplateVariant = z.object({
    label: z.string().min(1),
    objectKey: z.string().min(1),
    updatedAt: z.number().int(),
    variantId: z.string().min(1),
});
export const PlayerTemplateSlot = z.object({
    activeVariantId: z.string().min(1).optional(),
    nodeId: z.string().min(1),
    variants: z.array(PlayerTemplateVariant),
});
export const Player = z.object({
    id: z.string().min(1),
    username: z.string().min(1),
    email: z.string().email().optional(),
    metadata: Metadata.optional(),
    preferences: PlayerPreferencesSchema.optional(),
    templateOverrides: z.record(z.string(), PlayerTemplateSlot).optional(),
});
