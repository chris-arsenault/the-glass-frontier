import { z } from 'zod';
import { Intent } from './Intent';
import { SkillCheckPlan, SkillCheckResult } from './SkillCheck';
import { TranscriptEntry } from './TranscriptEntry';
import { InventoryDelta } from '../Inventory';

export const TurnProgressPayloadSchema = z.object({
  playerIntent: Intent.optional(),
  skillCheckPlan: SkillCheckPlan.optional(),
  skillCheckResult: SkillCheckResult.optional(),
  gmMessage: TranscriptEntry.optional(),
  systemMessage: TranscriptEntry.optional(),
  gmSummary: z.string().optional(),
  failure: z.boolean().optional(),
  inventoryDelta: InventoryDelta.optional(),
});

export const TurnProgressEventSchema = z.object({
  jobId: z.string().min(1),
  chronicleId: z.string().min(1),
  turnSequence: z.number().int().nonnegative(),
  nodeId: z.string().min(1),
  step: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  status: z.enum(['start', 'success', 'error']),
  payload: TurnProgressPayloadSchema.optional(),
});

export type TurnProgressPayload = z.infer<typeof TurnProgressPayloadSchema>;
export type TurnProgressEvent = z.infer<typeof TurnProgressEventSchema>;
