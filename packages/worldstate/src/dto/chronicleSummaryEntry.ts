import { z } from 'zod';

export const ChronicleSummaryKindSchema = z.enum([
  'chronicle_story',
  'location_events',
  'character_echo',
]);

export const ChronicleSummaryEntrySchema = z.object({
  createdAt: z.number().int().nonnegative(),
  id: z.string().min(1),
  kind: ChronicleSummaryKindSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
  summary: z.string().min(1),
});

export type ChronicleSummaryKind = z.infer<typeof ChronicleSummaryKindSchema>;
export type ChronicleSummaryEntry = z.infer<typeof ChronicleSummaryEntrySchema>;
