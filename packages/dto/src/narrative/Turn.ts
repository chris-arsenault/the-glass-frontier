import { z } from 'zod';
import { TranscriptEntry } from './TranscriptEntry';
import { Intent } from './Intent';
import { SkillCheckPlan, SkillCheckResult } from './SkillCheck';

export const TurnSchema = z.object({
  id: z.string().min(1),
  chronicleId: z.string().min(1),
  playerMessage: TranscriptEntry,
  gmMessage: TranscriptEntry.optional(),
  systemMessage: TranscriptEntry.optional(),
  gmSummary: z.string().optional(),
  playerIntent: Intent.optional(),
  skillCheckPlan: SkillCheckPlan.optional(),
  skillCheckResult: SkillCheckResult.optional(),
  turnSequence: z.number().int().nonnegative(),
  failure: z.boolean(),
});
export type Turn = z.infer<typeof TurnSchema>;
