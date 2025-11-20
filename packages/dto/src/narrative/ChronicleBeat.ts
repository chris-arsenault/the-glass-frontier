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
  summary: z.string(),
  targetBeatId: z.string().min(1).optional().nullable(),
});

export type ChronicleBeatStatus = z.infer<typeof ChronicleBeatStatus>;
export type ChronicleBeat = z.infer<typeof ChronicleBeat>;
export type IntentBeatDirective = z.infer<typeof IntentBeatDirective>;

const BeatChangeKind = z.enum(["advance", "resolve"]);

const BeatUpdateSchema = z.object({
  beatId: z.string().describe("Must match an existing beat ID."),
  changeKind: BeatChangeKind.describe("advance=progress; resolve=end."),
  description: z
    .string()
    .optional()
    .nullable()
    .describe("New 1–2 sentence text if beat description changed."),
  status: ChronicleBeatStatus.optional().nullable().describe(
    "New status. If resolve→succeeded/failed. If advance→in_progress or null."
  )
});

const NewBeatSchema = z
  .object({
    title: z.string().describe("≤6 words."),
    description: z.string().describe("≤240 chars.")
  })
  .nullable()
  .describe("Beat details if spawning new; else null.");

export const BeatTrackerSchema = z.object({
  focusBeatId: z
    .string()
    .nullable()
    .describe("Beat most affected; null if none exist."),
  newBeat: NewBeatSchema,
  updates: z
    .array(BeatUpdateSchema)
    .describe("Only beats that changed; empty array if none.")
});

export type BeatTracker = z.infer<typeof BeatTrackerSchema>;
