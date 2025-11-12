import { z } from 'zod';

export const ChronicleSeed = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  teaser: z.string().min(1),
  tags: z.array(z.string()).default([]),
});

export type ChronicleSeed = z.infer<typeof ChronicleSeed>;
