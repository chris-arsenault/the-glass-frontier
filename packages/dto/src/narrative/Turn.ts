import { z } from 'zod';

import { LlmTraceSchema } from '../audit/LlmAudit';
import { InventoryDeltaSchema } from '../Inventory';
import { BeatTrackerSchema } from './ChronicleBeat';
import { EntityReference, EntityRosterEntry, EntityUsageEntry } from './EntityReference';
import { Front } from './Front';
import { Intent } from './Intent';
import { LocationDeltaDecision } from './LocationDelta';
import { ProseAlternate } from './ProseAgent';
import { SceneContext } from './Scene';
import { SkillCheckPlan, SkillCheckResult } from './SkillCheck';
import { TranscriptEntry } from './TranscriptEntry';

export const TurnSchema = z.object({
  advancesTimeline: z.boolean().optional(),
  beatTracker: BeatTrackerSchema.optional(),
  /** Whether persistence has the chronicle checkpoint required to branch here. */
  canBranch: z.boolean().optional(),
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
  /** Agent-panel narrations recorded next to the canonical one during evaluation. */
  proseAlternates: z.array(ProseAlternate).optional(),
  /** USD cost of the canonical narration call, for comparison with the panel. */
  proseCostUsd: z.number().nonnegative().optional(),
  sceneContext: SceneContext.nullable().optional(),
  skillCheckPlan: SkillCheckPlan.optional(),
  skillCheckResult: SkillCheckResult.optional(),
  systemMessage: TranscriptEntry.optional(),
  turnSequence: z.number().int().nonnegative(),
  /**
   * What the world did this turn, recorded whether or not the narration showed
   * it. Read back into later turns so a quiet stir on one turn is still there
   * when it lands on another.
   */
  worldContent: z.string().optional(),
  /** The state of the world's own agendas as this turn left them. */
  worldFronts: z.array(Front).optional(),
});
export type Turn = z.infer<typeof TurnSchema>;
