import { z } from 'zod';

import { LlmTraceSchema } from '../audit/LlmAudit';
import { InventoryDelta } from '../Inventory';
import { BeatDelta } from './ChronicleBeat';
import { Intent } from './Intent';
import { IntentType as IntentTypeSchema } from './IntentType';
import { SkillCheckPlan, SkillCheckResult } from './SkillCheck';
import { TranscriptEntry } from './TranscriptEntry';

export const TurnProgressPayloadSchema = z.object({
  advancesTimeline: z.boolean().optional(),
  beatDelta: BeatDelta.optional(),
  chronicleShouldClose: z.boolean().optional(),
  executedNodes: z.array(z.string().min(1)).max(48).optional(),
  failure: z.boolean().optional(),
  gmMessage: TranscriptEntry.optional(),
  gmSummary: z.string().optional(),
  gmTrace: LlmTraceSchema.optional(),
  handlerId: z.string().optional(),
  inventoryDelta: InventoryDelta.optional(),
  playerIntent: Intent.optional(),
  resolvedIntentConfidence: z.number().min(0).max(1).optional(),
  resolvedIntentType: IntentTypeSchema.optional(),
  skillCheckPlan: SkillCheckPlan.optional(),
  skillCheckResult: SkillCheckResult.optional(),
  systemMessage: TranscriptEntry.optional(),
  worldDeltaTags: z.array(z.string().min(1)).max(16).optional(),
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
