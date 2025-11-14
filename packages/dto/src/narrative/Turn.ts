import { z } from 'zod';

import { LlmTraceSchema } from '../audit/LlmAudit';
import { InventoryDelta } from '../Inventory';
import { BeatDelta } from './ChronicleBeat';
import { Intent } from './Intent';
import { SkillCheckPlan, SkillCheckResult } from './SkillCheck';
import { TranscriptEntry } from './TranscriptEntry';

export const TurnSchema = z.object({
  beatDelta: BeatDelta.optional(),
  chronicleId: z.string().min(1),
  failure: z.boolean(),
  gmMessage: TranscriptEntry.optional(),
  gmSummary: z.string().optional(),
  gmTrace: LlmTraceSchema.optional(),
  id: z.string().min(1),
  inventoryDelta: InventoryDelta.optional(),
  playerIntent: Intent.optional(),
  playerMessage: TranscriptEntry,
  skillCheckPlan: SkillCheckPlan.optional(),
  skillCheckResult: SkillCheckResult.optional(),
  systemMessage: TranscriptEntry.optional(),
  turnSequence: z.number().int().nonnegative(),
});
export type Turn = z.infer<typeof TurnSchema>;
