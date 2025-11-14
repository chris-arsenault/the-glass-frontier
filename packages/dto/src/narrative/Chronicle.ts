import { z } from 'zod';

import { Metadata } from '../Metadata';
import { ChronicleBeat } from './ChronicleBeat';

export const Chronicle = z.object({
  beats: z.array(ChronicleBeat).default([]),
  beatsEnabled: z.boolean().default(true),
  characterId: z.string().min(1).optional(),
  id: z.string().min(1),
  locationId: z.string().min(1),
  loginId: z.string().min(1),
  metadata: Metadata.optional(),
  seedText: z.string().optional(),
  status: z.enum(['open', 'closed']).default('open'),
  targetEndTurn: z.number().int().nonnegative().nullable().optional(),
  title: z.string().min(1),
});

export type Chronicle = z.infer<typeof Chronicle>;
