import { z } from 'zod';

import { MetadataSchema, TagArraySchema } from './shared';

export const CharacterAttributeKeySchema = z.enum([
  'resolve',
  'cunning',
  'vigor',
  'focus',
  'heart',
]);
export type CharacterAttributeKey = z.infer<typeof CharacterAttributeKeySchema>;

export const AttributeTierSchema = z.enum(['fool', 'rook', 'adept', 'virtuoso', 'legend']);
export type AttributeTier = z.infer<typeof AttributeTierSchema>;

export const CharacterAttributesSchema = z.object({
  resolve: AttributeTierSchema,
  cunning: AttributeTierSchema,
  vigor: AttributeTierSchema,
  focus: AttributeTierSchema,
  heart: AttributeTierSchema,
});
export type CharacterAttributes = z.infer<typeof CharacterAttributesSchema>;

export const MomentumStateSchema = z.object({
  current: z.number().int().min(-10).max(10).default(0),
  floor: z.number().int().min(-10).max(10).default(-2),
  ceiling: z.number().int().min(-10).max(10).default(2),
  lastUpdatedAt: z.string().datetime().optional(),
});
export type MomentumState = z.infer<typeof MomentumStateSchema>;

export const SkillSchema = z.object({
  name: z.string().min(1),
  tier: AttributeTierSchema,
  tags: TagArraySchema,
  lastAdvancedAt: z.string().datetime().optional(),
  metadata: MetadataSchema.optional(),
});
export type Skill = z.infer<typeof SkillSchema>;

export const CharacterSkillsSchema = z.record(z.string().min(1), SkillSchema).default({});
export type CharacterSkills = z.infer<typeof CharacterSkillsSchema>;

export const InventoryEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  quantity: z.number().int().nonnegative().default(1),
  tags: TagArraySchema,
  metadata: MetadataSchema.optional(),
});
export type InventoryEntry = z.infer<typeof InventoryEntrySchema>;

export const InventorySchema = z.object({
  carried: z.array(InventoryEntrySchema).default([]),
  stored: z.array(InventoryEntrySchema).default([]),
  equipped: z.record(z.string().min(1), InventoryEntrySchema).default({}),
  capacity: z.number().int().nonnegative().default(10),
  metadata: MetadataSchema.optional(),
});
export type Inventory = z.infer<typeof InventorySchema>;

export const CharacterLocationStateSchema = z.object({
  locationId: z.string().min(1),
  placeId: z.string().min(1),
  breadcrumb: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      kind: z.string().min(1),
    })
  ).nonempty(),
  certainty: z.number().min(0).max(1).default(1),
  updatedAt: z.string().datetime(),
});
export type CharacterLocationState = z.infer<typeof CharacterLocationStateSchema>;

export const CharacterStatusSchema = z.enum(['draft', 'active', 'retired', 'archived']);
export type CharacterStatus = z.infer<typeof CharacterStatusSchema>;

export const CharacterSchema = z.object({
  id: z.string().min(1),
  loginId: z.string().min(1),
  defaultChronicleId: z.string().optional(),

  name: z.string().min(1),
  pronouns: z.string().min(1),
  archetype: z.string().min(1),
  bio: z.string().optional(),
  portraitUrl: z.string().url().optional(),
  tags: TagArraySchema,
  status: CharacterStatusSchema.default('active'),
  metadata: MetadataSchema.optional(),

  attributes: CharacterAttributesSchema,
  skills: CharacterSkillsSchema,
  momentum: MomentumStateSchema,
  inventory: InventorySchema,
  lastTurnAt: z.string().datetime().optional(),
  locationState: CharacterLocationStateSchema.optional(),
  echoes: z
    .array(
      z.object({
        chronicleId: z.string().min(1),
        summary: z.string().min(1),
        createdAt: z.string().datetime(),
        metadata: MetadataSchema.optional(),
      })
    )
    .default([]),

  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Character = z.infer<typeof CharacterSchema>;

export const CharacterDraftSchema = z.object({
  id: z.string().uuid().optional(),
  loginId: z.string().min(1),
  name: z.string().min(1),
  pronouns: z.string().min(1),
  archetype: z.string().min(1),
  bio: z.string().optional(),
  portraitUrl: z.string().url().optional(),
  tags: TagArraySchema,
  metadata: MetadataSchema.optional(),
  attributes: CharacterAttributesSchema,
  skills: CharacterSkillsSchema,
  momentum: MomentumStateSchema,
  inventory: InventorySchema.optional(),
  locationState: CharacterLocationStateSchema.optional(),
  echoes: z
    .array(
      z.object({
        chronicleId: z.string().min(1),
        summary: z.string().min(1),
        createdAt: z.string().datetime(),
        metadata: MetadataSchema.optional(),
      })
    )
    .default([]),
  defaultChronicleId: z.string().optional(),
});
export type CharacterDraft = z.infer<typeof CharacterDraftSchema>;

export const CharacterSummarySchema = z.object({
  id: z.string().min(1),
  loginId: z.string().min(1),
  name: z.string().min(1),
  archetype: z.string().min(1),
  portraitUrl: z.string().url().optional(),
  lastTurnAt: z.string().datetime().nullable().optional(),
  status: CharacterStatusSchema.default('active'),
  tags: TagArraySchema,
});
export type CharacterSummary = z.infer<typeof CharacterSummarySchema>;
