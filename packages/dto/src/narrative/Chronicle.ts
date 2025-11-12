import { z } from 'zod';
import { Metadata } from '../Metadata';

export const Chronicle = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  loginId: z.string().min(1),
  locationId: z.string().min(1),
  characterId: z.string().min(1).optional(),
  status: z.enum(['open', 'closed']).default('open'),
  seedText: z.string().optional(),
  metadata: Metadata.optional(),
});

export type Chronicle = z.infer<typeof Chronicle>;
