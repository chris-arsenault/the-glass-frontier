import { z } from 'zod';

import { MetadataSchema, TagArraySchema } from './shared';

export const ChronicleBeatStatusSchema = z.enum(['in_progress', 'paused', 'succeeded', 'failed']);
export type ChronicleBeatStatus = z.infer<typeof ChronicleBeatStatusSchema>;

export const ChronicleBeatSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  status: ChronicleBeatStatusSchema.default('in_progress'),
  tags: TagArraySchema,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  resolvedAt: z.number().int().nonnegative().optional(),
  metadata: MetadataSchema.optional(),
});

export type ChronicleBeat = z.infer<typeof ChronicleBeatSchema>;
