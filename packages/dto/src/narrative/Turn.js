import { z } from 'zod';
import { LlmTraceSchema } from '../audit/LlmAudit';
import { InventoryDeltaSchema } from '../Inventory';
import { BeatTrackerSchema } from './ChronicleBeat';
import { Intent } from './Intent';
import { IntentType as IntentTypeSchema } from './IntentType';
import { SkillCheckPlan, SkillCheckResult } from './SkillCheck';
import { TranscriptEntry } from './TranscriptEntry';
const EntityUsageEntry = z.object({
    entityId: z.string().min(1),
    entitySlug: z.string().min(1),
    tags: z.array(z.string()),
    usage: z.enum(['unused', 'mentioned', 'central']),
    emergentTags: z.array(z.string()).nullable(),
});
const EntitySnippet = z.object({
    id: z.string().min(1),
    slug: z.string().min(1),
    name: z.string().min(1),
    kind: z.string().min(1),
    subkind: z.string().optional(),
    description: z.string().optional(),
    status: z.string().optional(),
    tags: z.array(z.string()),
    loreFragments: z.array(z.object({
        slug: z.string().min(1),
        title: z.string().min(1),
        summary: z.string().min(1),
        tags: z.array(z.string()),
    })),
    score: z.number(),
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
    handlerId: z.string().optional(),
    id: z.string().min(1),
    inventoryDelta: InventoryDeltaSchema.optional(),
    playerIntent: Intent.optional(),
    playerMessage: TranscriptEntry,
    resolvedIntentConfidence: z.number().min(0).max(1).optional(),
    resolvedIntentType: IntentTypeSchema.optional(),
    skillCheckPlan: SkillCheckPlan.optional(),
    skillCheckResult: SkillCheckResult.optional(),
    systemMessage: TranscriptEntry.optional(),
    turnSequence: z.number().int().nonnegative(),
    worldDeltaTags: z.array(z.string().min(1)).max(16).optional(),
});
