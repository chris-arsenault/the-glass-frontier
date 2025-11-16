import { z } from 'zod';

export const CharacterStatusSchema = z.enum(['draft', 'active', 'retired', 'archived']);
export type CharacterStatus = z.infer<typeof CharacterStatusSchema>;

export const CharacterSummarySchema = z.object({
  id: z.string().min(1),
  loginId: z.string().min(1),
  name: z.string().min(1),
  archetype: z.string().min(1),
  heroArtUrl: z.string().min(1).optional(),
  lastPlayedAt: z.string().datetime().nullable().optional(),
  status: CharacterStatusSchema.default('active'),
  tags: z.array(z.string().min(1)).default([]),
});

export type CharacterSummary = z.infer<typeof CharacterSummarySchema>;

export const CharacterDraftSchema = CharacterSummarySchema.extend({
  id: z.string().uuid().optional(),
  description: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  payload: z.unknown().optional(),
});

export type CharacterDraft = z.infer<typeof CharacterDraftSchema>;

export const CharacterSchema = CharacterSummarySchema.extend({
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  biography: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  payload: z.unknown().optional(),
});

export type Character = z.infer<typeof CharacterSchema>;
