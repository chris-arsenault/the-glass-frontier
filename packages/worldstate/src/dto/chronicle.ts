import { z } from 'zod';

import { ChronicleBeatSchema } from './chronicleBeat';
import { ChronicleSummaryEntrySchema } from './chronicleSummaryEntry';
import { MetadataSchema, TagArraySchema } from './shared';

export const ChronicleStatusSchema = z.enum(['draft', 'active', 'paused', 'completed', 'archived']);
export type ChronicleStatus = z.infer<typeof ChronicleStatusSchema>;

export const TurnPreviewSchema = z.object({
  turnId: z.string().min(1),
  turnSequence: z.number().int().nonnegative(),
  summary: z.string().min(1),
  createdAt: z.string().datetime(),
});

export type TurnPreview = z.infer<typeof TurnPreviewSchema>;

export const ChronicleSummarySchema = z.object({
  id: z.string().min(1),
  loginId: z.string().min(1),
  characterId: z.string().min(1),
  title: z.string().min(1),
  status: ChronicleStatusSchema,
  lastTurnPreview: TurnPreviewSchema.optional(),
  turnChunkCount: z.number().int().nonnegative().default(0),
  heroArtUrl: z.string().min(1).optional(),
});

export type ChronicleSummary = z.infer<typeof ChronicleSummarySchema>;

export const ChronicleDraftSchema = ChronicleSummarySchema.extend({
  id: z.string().uuid().optional(),
  locationId: z.string().min(1).optional(),
  description: z.string().optional(),
  metadata: MetadataSchema.optional(),
  tags: TagArraySchema,
  beatsEnabled: z.boolean().default(true),
  beats: z.array(ChronicleBeatSchema).default([]),
  summaries: z.array(ChronicleSummaryEntrySchema).default([]),
  seedText: z.string().optional(),
});

export type ChronicleDraft = z.infer<typeof ChronicleDraftSchema>;

export const ChronicleSchema = ChronicleSummarySchema.extend({
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  locationId: z.string().min(1).optional(),
  description: z.string().optional(),
  metadata: MetadataSchema.optional(),
  tags: TagArraySchema,
  beatsEnabled: z.boolean().default(true),
  beats: z.array(ChronicleBeatSchema).default([]),
  summaries: z.array(ChronicleSummaryEntrySchema).default([]),
  seedText: z.string().optional(),
});

export type Chronicle = z.infer<typeof ChronicleSchema>;
