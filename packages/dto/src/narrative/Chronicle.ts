import { z } from 'zod';

import { Metadata } from '../Metadata';
import { ChronicleBeat } from './ChronicleBeat';
import { ChronicleSummaryEntry } from './ChronicleSummary';

const EntityFocusState = z.object({
  entityScores: z.record(z.string(), z.number()).default({}),
  tagScores: z.record(z.string(), z.number()).default({}),
  lastUpdated: z.number().int().nonnegative().optional(),
});

export const Chronicle = z.object({
  beats: z.array(ChronicleBeat).default([]),
  beatsEnabled: z.boolean().default(true),
  characterId: z.string().min(1).optional(),
  id: z.string().min(1),
  locationId: z.string().min(1),
  playerId: z.string().min(1),
  anchorEntityId: z.string().min(1).optional(),
  entityFocus: EntityFocusState.default({ entityScores: {}, tagScores: {} }),
  metadata: Metadata.optional(),
  seedText: z.string().optional(),
  status: z.enum(['open', 'closed']).default('open'),
  summaries: z.array(ChronicleSummaryEntry).default([]),
  targetEndTurn: z.number().int().nonnegative().nullable().optional(),
  title: z.string().min(1),
});

export type Chronicle = z.infer<typeof Chronicle>;
