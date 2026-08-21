import { z } from 'zod';

import { LlmTraceSchema } from '../audit/LlmAudit';
import { InventoryDeltaSchema } from '../Inventory';
import { BeatTrackerSchema } from './ChronicleBeat';
import { Intent } from './Intent';
import { SkillCheckPlan, SkillCheckResult } from './SkillCheck';
import { TranscriptEntry } from './TranscriptEntry';

export const TurnProgressPayloadSchema = z.object({
  advancesTimeline: z.boolean().optional(),
  beatTracker: BeatTrackerSchema.optional(),
  chronicleShouldClose: z.boolean().optional(),
  executedNodes: z.array(z.string().min(1)).max(48).optional(),
  failure: z.boolean().optional(),
  gmMessage: TranscriptEntry.optional(),
  gmSummary: z.string().optional(),
  gmTrace: LlmTraceSchema.optional(),
  inventoryDelta: InventoryDeltaSchema.optional(),
  playerIntent: Intent.optional(),
  skillCheckPlan: SkillCheckPlan.optional(),
  skillCheckResult: SkillCheckResult.optional(),
});

export const TurnProgressEventSchema = z.object({
  chronicleId: z.string().min(1),
  jobId: z.string().min(1),
  nodeId: z.string().min(1),
  payload: TurnProgressPayloadSchema.optional(),
  playerId: z.string().min(1),
  status: z.enum(['start', 'success', 'error']),
  step: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  turnSequence: z.number().int().nonnegative(),
});

export type TurnProgressPayload = z.infer<typeof TurnProgressPayloadSchema>;
export type TurnProgressEvent = z.infer<typeof TurnProgressEventSchema>;
