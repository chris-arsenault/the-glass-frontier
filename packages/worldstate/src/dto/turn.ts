import { z } from 'zod';

import { CharacterAttributeKeySchema } from './character';
import { LocationBreadcrumbEntrySchema } from './location';
import { MetadataSchema, TagArraySchema } from './shared';

export const IntentTypeSchema = z.enum([
  'action',
  'inquiry',
  'clarification',
  'possibility',
  'planning',
  'reflection',
]);
export type IntentType = z.infer<typeof IntentTypeSchema>;

export const IntentBeatDirectiveSchema = z.object({
  kind: z.enum(['existing', 'new', 'independent']),
  targetBeatId: z.string().min(1).optional(),
  summary: z.string().optional(),
});

export type IntentBeatDirective = z.infer<typeof IntentBeatDirectiveSchema>;

export const TranscriptEntrySchema = z.object({
  id: z.string().min(1),
  role: z.enum(['player', 'gm', 'system', 'narrator']),
  content: z.string().default(''),
  tokenCount: z.number().int().nonnegative().optional(),
  attachments: z.array(z.string().min(1)).optional(),
  metadata: MetadataSchema.optional(),
});

export type TranscriptEntry = z.infer<typeof TranscriptEntrySchema>;

export const BeatSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.string().default('in_progress'),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  resolvedAt: z.number().int().nonnegative().optional(),
});

export type Beat = z.infer<typeof BeatSchema>;

export const BeatDeltaSchema = z.object({
  created: z.array(BeatSchema).optional(),
  updated: z.array(BeatSchema).optional(),
  focusBeatId: z.string().min(1).optional(),
});

export type BeatDelta = z.infer<typeof BeatDeltaSchema>;

export const IntentSchema = z.object({
  intentType: IntentTypeSchema.optional(),
  summary: z.string().default(''),
  tone: z.string().optional(),
  skill: z.string().optional(),
  attribute: CharacterAttributeKeySchema.optional(),
  requiresCheck: z.boolean().default(false),
  creativeSpark: z.boolean().default(false),
  handlerHints: z.array(z.string().min(1)).max(8).optional(),
  metadata: MetadataSchema.optional(),
  beatDirective: IntentBeatDirectiveSchema.optional(),
});

export type Intent = z.infer<typeof IntentSchema>;

export const RiskLevelSchema = z.enum(['controlled', 'standard', 'risky', 'desperate']);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const SkillCheckPlanSchema = z.object({
  skill: z.string().min(1),
  attribute: CharacterAttributeKeySchema.optional(),
  difficulty: z.string().optional(),
  riskLevel: RiskLevelSchema.optional(),
  metadata: MetadataSchema.optional(),
});

export type SkillCheckPlan = z.infer<typeof SkillCheckPlanSchema>;

export const OutcomeTierSchema = z.enum(['breakthrough', 'advance', 'stall', 'regress', 'collapse']);
export type OutcomeTier = z.infer<typeof OutcomeTierSchema>;

export const SkillCheckResultSchema = z.object({
  outcomeTier: OutcomeTierSchema,
  margin: z.number().optional(),
  complications: z.array(z.string().min(1)).optional(),
  metadata: MetadataSchema.optional(),
});

export type SkillCheckResult = z.infer<typeof SkillCheckResultSchema>;

export const InventoryDeltaOpSchema = z.object({
  op: z.enum(['add', 'remove', 'equip', 'unequip', 'consume', 'spend_shard']),
  name: z.string().optional(),
  hook: z.string().optional(),
  amount: z.number().optional(),
  bucket: z.string().optional(),
  slot: z.string().optional(),
  metadata: MetadataSchema.optional(),
});

export type InventoryDeltaOp = z.infer<typeof InventoryDeltaOpSchema>;

export const InventoryDeltaSchema = z.object({
  ops: z.array(InventoryDeltaOpSchema).default([]),
});

export type InventoryDelta = z.infer<typeof InventoryDeltaSchema>;

export const LlmTraceSchema = z.object({
  provider: z.string().min(1),
  requestId: z.string().min(1),
  promptTokens: z.number().int().nonnegative().optional(),
  completionTokens: z.number().int().nonnegative().optional(),
  metadata: MetadataSchema.optional(),
});

export type LlmTrace = z.infer<typeof LlmTraceSchema>;

export const LocationContextSchema = z.object({
  locationId: z.string().min(1),
  placeId: z.string().min(1),
  placeName: z.string().min(1),
  breadcrumb: z.array(LocationBreadcrumbEntrySchema).nonempty(),
  certainty: z.number().min(0).max(1).default(1),
});

export type LocationContext = z.infer<typeof LocationContextSchema>;

export const LocationDeltaSchema = z.object({
  before: LocationContextSchema.optional(),
  after: LocationContextSchema.optional(),
});

export type LocationDelta = z.infer<typeof LocationDeltaSchema>;

export const TurnSchema = z.object({
  id: z.string().min(1),
  chronicleId: z.string().min(1),
  characterId: z.string().min(1),
  loginId: z.string().min(1),
  turnSequence: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),

  advancesTimeline: z.boolean().optional(),
  executedNodes: z.array(z.string().min(1)).max(48).optional(),

  playerMessage: TranscriptEntrySchema,
  playerIntent: IntentSchema.optional(),
  resolvedIntentType: IntentTypeSchema.optional(),
  resolvedIntentConfidence: z.number().min(0).max(1).optional(),

  gmMessage: TranscriptEntrySchema.optional(),
  gmSummary: z.string().optional(),
  gmTrace: LlmTraceSchema.optional(),
  systemMessage: TranscriptEntrySchema.optional(),

  failure: z.boolean().default(false),
  skillCheckPlan: SkillCheckPlanSchema.optional(),
  skillCheckResult: SkillCheckResultSchema.optional(),

  inventoryDelta: InventoryDeltaSchema.optional(),
  beatDelta: BeatDeltaSchema.optional(),
  worldDeltaTags: z.array(z.string().min(1)).max(16).optional(),

  locationContext: LocationContextSchema.optional(),
  locationDelta: LocationDeltaSchema.optional(),

  handlerId: z.string().optional(),
  metadata: MetadataSchema.optional(),
});

export type Turn = z.infer<typeof TurnSchema>;

export const TurnSummarySchema = z.object({
  turnId: z.string().min(1),
  turnSequence: z.number().int().nonnegative(),
  summary: z.string().min(1),
  createdAt: z.string().datetime(),
});

export type TurnSummary = z.infer<typeof TurnSummarySchema>;

export const TurnChunkSchema = z.object({
  chronicleId: z.string().min(1),
  chunkIndex: z.number().int().nonnegative(),
  startSequence: z.number().int().nonnegative(),
  endSequence: z.number().int().nonnegative(),
  turns: z.array(TurnSchema),
  updatedAt: z.string().datetime(),
});

export type TurnChunk = z.infer<typeof TurnChunkSchema>;

export const TurnChunkManifestEntrySchema = z.object({
  chunkIndex: z.number().int().nonnegative(),
  startSequence: z.number().int().nonnegative(),
  endSequence: z.number().int().nonnegative(),
  chunkKey: z.string().min(1),
  turnCount: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
});

export type TurnChunkManifestEntry = z.infer<typeof TurnChunkManifestEntrySchema>;

export const TurnChunkManifestSchema = z.object({
  chronicleId: z.string().min(1),
  chunkSize: z.number().int().positive(),
  entries: z.array(TurnChunkManifestEntrySchema),
  latestSequence: z.number().int().nonnegative().default(0),
  updatedAt: z.string().datetime(),
});

export type TurnChunkManifest = z.infer<typeof TurnChunkManifestSchema>;
