import { z } from 'zod';

import { LlmTraceSchema } from '../audit/LlmAudit';
import { InventoryDelta } from '../Inventory';
import { BeatDelta } from './ChronicleBeat';
import { Intent } from './Intent';
import { SkillCheckPlan, SkillCheckResult } from './SkillCheck';
import { TranscriptEntry } from './TranscriptEntry';

export const TurnProgressPayloadSchema = z.object({
  beatDelta: BeatDelta.optional(),
  chronicleShouldClose: z.boolean().optional(),
  failure: z.boolean().optional(),
  gmMessage: TranscriptEntry.optional(),
  gmSummary: z.string().optional(),
  gmTrace: LlmTraceSchema.optional(),
  inventoryDelta: InventoryDelta.optional(),
  playerIntent: Intent.optional(),
  skillCheckPlan: SkillCheckPlan.optional(),
  skillCheckResult: SkillCheckResult.optional(),
  systemMessage: TranscriptEntry.optional(),
});

export const TurnProgressEventSchema = z.object({
  chronicleId: z.string().min(1),
  jobId: z.string().min(1),
  nodeId: z.string().min(1),
  payload: TurnProgressPayloadSchema.optional(),
  status: z.enum(['start', 'success', 'error']),
  step: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  turnSequence: z.number().int().nonnegative(),
});

export type TurnProgressPayload = z.infer<typeof TurnProgressPayloadSchema>;
export type TurnProgressEvent = z.infer<typeof TurnProgressEventSchema>;
