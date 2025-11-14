import { z } from 'zod';

export const ChronicleBeatStatus = z.enum(['in_progress', 'succeeded', 'failed']);

export const ChronicleBeat = z.object({
  createdAt: z.number().int().nonnegative(),
  description: z.string().min(1),
  id: z.string().min(1),
  resolvedAt: z.number().int().nonnegative().optional(),
  status: ChronicleBeatStatus,
  title: z.string().min(1),
  updatedAt: z.number().int().nonnegative(),
});

export const IntentBeatDirective = z.object({
  kind: z.enum(['independent', 'existing', 'new']).default('independent'),
  summary: z.string().optional(),
  targetBeatId: z.string().min(1).optional(),
});

export const BeatDelta = z.object({
  created: z.array(ChronicleBeat).optional(),
  focusBeatId: z.string().min(1).optional(),
  updated: z.array(ChronicleBeat).optional(),
});

export type ChronicleBeatStatus = z.infer<typeof ChronicleBeatStatus>;
export type ChronicleBeat = z.infer<typeof ChronicleBeat>;
export type IntentBeatDirective = z.infer<typeof IntentBeatDirective>;
export type BeatDelta = z.infer<typeof BeatDelta>;
