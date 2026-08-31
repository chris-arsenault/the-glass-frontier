import { z } from 'zod';

const ENCYCLOPEDIA_SLUG_PREFIX = 'encyclopedia:';

export const ContextScope = z.enum(['world', 'place', 'scene', 'participant']);
export type ContextScope = z.infer<typeof ContextScope>;

export const ContextTagDefinition = z.object({
  compatibleWith: z.array(z.string().min(1)).default([]),
  description: z.string().nullable(),
  id: z.string().min(1),
  parent: z.string().min(1).optional(),
  scopes: z.array(ContextScope).min(1),
});
export type ContextTagDefinition = z.infer<typeof ContextTagDefinition>;

export const ContextTerm = z.discriminatedUnion('type', [
  z.object({ scope: ContextScope, tag: z.string().min(1), type: z.literal('tag') }),
  z.object({
    encyclopediaExternalKey: z.string().min(1),
    scope: ContextScope,
    type: z.literal('encyclopedia'),
  }),
]);
export type ContextTerm = z.infer<typeof ContextTerm>;

export const ContextSelector = z.object({
  all: z.array(ContextTerm).default([]),
  any: z.array(ContextTerm).default([]),
  none: z.array(ContextTerm).default([]),
});
export type ContextSelector = z.infer<typeof ContextSelector>;

export const EncyclopediaAvailability = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('global') }),
  z.object({ mode: z.literal('contextual'), selectors: z.array(ContextSelector).min(1) }),
]);
export type EncyclopediaAvailability = z.infer<typeof EncyclopediaAvailability>;

export const EncyclopediaStatus = z.enum(['shell', 'draft', 'complete']);
export type EncyclopediaStatus = z.infer<typeof EncyclopediaStatus>;

export const EncyclopediaPrevalence = z.enum(['common', 'uncommon', 'rare']);
export type EncyclopediaPrevalence = z.infer<typeof EncyclopediaPrevalence>;

export const EncyclopediaCharacterRole = z.enum(['species', 'culture']);
export type EncyclopediaCharacterRole = z.infer<typeof EncyclopediaCharacterRole>;

export const EncyclopediaAbilityTier = z.object({
  cost: z.string().min(1).optional(),
  effect: z.string().min(1),
  tier: z.string().min(1),
});
export type EncyclopediaAbilityTier = z.infer<typeof EncyclopediaAbilityTier>;

export const EncyclopediaUsage = z.object({
  affordances: z.array(z.string().min(1)).default([]),
  cues: z.array(z.string().min(1)).default([]),
  pressures: z.array(z.string().min(1)).default([]),
  variations: z.array(z.string().min(1)).default([]),
});
export type EncyclopediaUsage = z.infer<typeof EncyclopediaUsage>;

export const EncyclopediaSection = z.object({
  audience: z.enum(['player', 'gm']),
  heading: z.string().min(1),
  text: z.string().min(1),
});
export type EncyclopediaSection = z.infer<typeof EncyclopediaSection>;

export const EncyclopediaAtlasRecord = z.object({
  kind: z.string().min(1),
  slug: z.string().min(1),
  subkind: z.string().min(1),
  title: z.string().min(1),
});
export type EncyclopediaAtlasRecord = z.infer<typeof EncyclopediaAtlasRecord>;

export const EncyclopediaEntry = z.object({
  aliases: z.array(z.string().min(1)).default([]),
  availability: EncyclopediaAvailability.optional(),
  characterRole: EncyclopediaCharacterRole.optional(),
  descriptiveIdentity: z.record(z.string(), z.string().min(1)).default({}),
  dm: z.boolean().default(false),
  externalKey: z.string().min(1),
  facts: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  instances: z.array(EncyclopediaAtlasRecord).default([]),
  kind: z.string().min(1),
  members: z.array(EncyclopediaAtlasRecord).default([]),
  originBlurb: z.string().min(1).optional(),
  prevalence: EncyclopediaPrevalence.optional(),
  sections: z.array(EncyclopediaSection).default([]),
  slug: z.string().min(1),
  status: EncyclopediaStatus,
  subkind: z.string().min(1),
  summary: z.string().min(1).optional(),
  tiers: z.array(EncyclopediaAbilityTier).default([]),
  title: z.string().min(1),
  topics: z.array(z.string().min(1)).default([]),
  usage: EncyclopediaUsage,
});
export type EncyclopediaEntry = z.infer<typeof EncyclopediaEntry>;

export const EncyclopediaEntrySummary = z.object({
  kind: z.string().min(1),
  prevalence: EncyclopediaPrevalence,
  slug: z.string().startsWith(ENCYCLOPEDIA_SLUG_PREFIX),
  status: z.enum(['draft', 'complete']),
  subkind: z.string().min(1),
  summary: z.string().min(1),
  title: z.string().min(1),
  topics: z.array(z.string().min(1)),
});
export type EncyclopediaEntrySummary = z.infer<typeof EncyclopediaEntrySummary>;

export const PlayerEncyclopediaEntry = EncyclopediaEntry.omit({
  dm: true,
  externalKey: true,
  usage: true,
});
export type PlayerEncyclopediaEntry = z.infer<typeof PlayerEncyclopediaEntry>;

export const EncyclopediaCharacterOption = z.object({
  originBlurb: z.string().min(1),
  referenceId: z.string().uuid(),
  role: EncyclopediaCharacterRole,
  slug: z.string().startsWith(ENCYCLOPEDIA_SLUG_PREFIX),
  summary: z.string().min(1),
  title: z.string().min(1),
});
export type EncyclopediaCharacterOption = z.infer<typeof EncyclopediaCharacterOption>;

export const EncyclopediaClassification = z.object({
  atlasSlug: z.string().startsWith('atlas:'),
  atlasTitle: z.string().min(1),
  encyclopediaKind: z.string().min(1),
  encyclopediaSlug: z.string().startsWith(ENCYCLOPEDIA_SLUG_PREFIX),
  encyclopediaTitle: z.string().min(1),
  role: z.enum(['type', 'membership']),
});
export type EncyclopediaClassification = z.infer<typeof EncyclopediaClassification>;

export const WorldReferenceSlug = z.string().regex(/^(atlas|encyclopedia|chronicle):[^\s:]+$/);
export type WorldReferenceSlug = z.infer<typeof WorldReferenceSlug>;

export const DirectWorldReference = z.object({
  kind: z.string().min(1),
  slug: WorldReferenceSlug,
  title: z.string().min(1),
});
export type DirectWorldReference = z.infer<typeof DirectWorldReference>;

export const ReferenceUsageRole = z.enum([
  'texture',
  'interaction',
  'character_origin',
  'instance_basis',
]);
export type ReferenceUsageRole = z.infer<typeof ReferenceUsageRole>;

export const EncyclopediaUsageRecord = z.object({
  role: ReferenceUsageRole,
  slug: z.string().startsWith(ENCYCLOPEDIA_SLUG_PREFIX),
});
export type EncyclopediaUsageRecord = z.infer<typeof EncyclopediaUsageRecord>;

export const EncyclopediaMention = z.object({
  end: z.number().int().positive(),
  kind: z.string().min(1),
  slug: z.string().startsWith(ENCYCLOPEDIA_SLUG_PREFIX),
  start: z.number().int().nonnegative(),
  summary: z.string().min(1),
  title: z.string().min(1),
  transcriptEntryId: z.string().min(1),
}).refine((mention) => mention.end > mention.start, {
  message: 'Encyclopedia mention end must follow its start',
});
export type EncyclopediaMention = z.infer<typeof EncyclopediaMention>;
