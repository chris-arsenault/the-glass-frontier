import { z } from 'zod';

export const ChronicleSeedSchema = z.object({
  id: z.string().min(1),
  tags: z.array(z.string()).default([]),
  teaser: z.string().min(1),
  title: z.string().min(1),
});

export type ChronicleSeed = z.infer<typeof ChronicleSeedSchema>;

export const ChronicleSeedListSchema = z.object({
  seeds: z.array(ChronicleSeedSchema).min(3).max(3),
})

export type ChronicleSeedList = z.infer<typeof ChronicleSeedListSchema>;