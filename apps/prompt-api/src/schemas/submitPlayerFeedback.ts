import { IntentType as IntentTypeSchema, PLAYER_FEEDBACK_SENTIMENTS } from '@glass-frontier/dto';
import { z } from 'zod';

const feedbackSentimentSchema = z.enum(PLAYER_FEEDBACK_SENTIMENTS);

export const submitPlayerFeedbackInput = z.object({
  auditId: z.string().min(1),
  chronicleId: z.string().min(1),
  comment: z.string().max(2000).optional(),
  expectedIntentType: IntentTypeSchema.optional().nullable(),
  expectedInventoryDelta: z.boolean().optional().nullable(),
  expectedInventoryNotes: z.string().max(2000).optional(),
  expectedLocationChange: z.boolean().optional().nullable(),
  expectedLocationNotes: z.string().max(2000).optional(),
  expectedSkillCheck: z.boolean().optional().nullable(),
  expectedSkillNotes: z.string().max(2000).optional(),
  gmEntryId: z.string().min(1),
  playerId: z.string().min(1),
  sentiment: feedbackSentimentSchema,
  turnId: z.string().min(1),
  turnSequence: z.number().int().nonnegative(),
});
