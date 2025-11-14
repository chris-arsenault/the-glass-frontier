import { z } from 'zod';

export const ChronicleSummaryKind = z.enum([
  'chronicle_story',
  'location_events',
  'character_bio',
]);

export const ChronicleSummaryEntry = z.object({
  createdAt: z.number().int().nonnegative(),
  id: z.string().min(1),
  kind: ChronicleSummaryKind,
  metadata: z.record(z.string(), z.unknown()).optional(),
  summary: z.string().min(1),
});

export type ChronicleSummaryKind = z.infer<typeof ChronicleSummaryKind>;
export type ChronicleSummaryEntry = z.infer<typeof ChronicleSummaryEntry>;
