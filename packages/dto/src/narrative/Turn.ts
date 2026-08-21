import { z } from 'zod';

import { LlmTraceSchema } from '../audit/LlmAudit';
import { InventoryDeltaSchema } from '../Inventory';
import { BeatTrackerSchema } from './ChronicleBeat';
import { Intent } from './Intent';
import { LocationDeltaDecision } from './LocationDelta';
import { SkillCheckPlan, SkillCheckResult } from './SkillCheck';
import { TranscriptEntry } from './TranscriptEntry';

const EntityUsageEntry = z.object({
  emergentTags: z.array(z.string()).nullable(),
  entityId: z.string().min(1),
  entitySlug: z.string().min(1),
  tags: z.array(z.string()),
  usage: z.enum(['unused', 'mentioned', 'central']),
});

const EntitySnippet = z.object({
  description: z.string().optional(),
  id: z.string().min(1),
  kind: z.string().min(1),
  loreFragments: z.array(z.object({
    slug: z.string().min(1),
    summary: z.string().min(1),
    tags: z.array(z.string()),
    title: z.string().min(1),
  })),
  name: z.string().min(1),
  score: z.number(),
  slug: z.string().min(1),
  status: z.string().optional(),
  subkind: z.string().optional(),
  tags: z.array(z.string()),
});

export const TurnSchema = z.object({
  advancesTimeline: z.boolean().optional(),
  beatTracker: BeatTrackerSchema.optional(),
  chronicleId: z.string().min(1),
  entityOffered: z.array(EntitySnippet).optional(),
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
  skillCheckPlan: SkillCheckPlan.optional(),
  skillCheckResult: SkillCheckResult.optional(),
  systemMessage: TranscriptEntry.optional(),
  turnSequence: z.number().int().nonnegative(),
});
export type Turn = z.infer<typeof TurnSchema>;
