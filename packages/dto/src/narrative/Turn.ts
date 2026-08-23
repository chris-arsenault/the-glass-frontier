import { z } from 'zod';

import { LlmTraceSchema } from '../audit/LlmAudit';
import { InventoryDeltaSchema } from '../Inventory';
import { BeatTrackerSchema } from './ChronicleBeat';
import { EntityReference, EntityRosterEntry, EntityUsageEntry } from './EntityReference';
import { Intent } from './Intent';
import { LocationDeltaDecision } from './LocationDelta';
import { SceneContext } from './Scene';
import { SkillCheckPlan, SkillCheckResult } from './SkillCheck';
import { TranscriptEntry } from './TranscriptEntry';

export const TurnSchema = z.object({
  advancesTimeline: z.boolean().optional(),
  beatTracker: BeatTrackerSchema.optional(),
  chronicleId: z.string().min(1),
  entityReferences: z.array(EntityReference).optional(),
  entityRoster: z.array(EntityRosterEntry).optional(),
  entityUsage: z.array(EntityUsageEntry).optional(),
  executedNodes: z.array(z.string().min(1)).max(48).optional(),
  failure: z.boolean(),
  gmResponse: TranscriptEntry.optional(),
  gmSummary: z.string().optional(),
  gmTrace: LlmTraceSchema.optional(),
  id: z.string().min(1),
  inventoryDelta: InventoryDeltaSchema.optional(),
  locationDelta: LocationDeltaDecision.optional(),
  playerIntent: Intent.optional(),
  playerMessage: TranscriptEntry,
  sceneContext: SceneContext.nullable().optional(),
  skillCheckPlan: SkillCheckPlan.optional(),
  skillCheckResult: SkillCheckResult.optional(),
  systemMessage: TranscriptEntry.optional(),
  turnSequence: z.number().int().nonnegative(),
});
export type Turn = z.infer<typeof TurnSchema>;
