import { z } from 'zod';

/**
 * `succeeded`/`failed` are outcomes the story earned. `superseded` means a
 * newer beat replaced this goal as play drifted (see `supersededBy`);
 * `abandoned` means the player moved against it or its premise stopped being
 * true. All four are terminal.
 */
export const ChronicleBeatStatus = z.enum([
  'in_progress',
  'succeeded',
  'failed',
  'superseded',
  'abandoned',
]);

export const TERMINAL_BEAT_STATUSES: ReadonlySet<ChronicleBeatStatus> = new Set([
  'succeeded',
  'failed',
  'superseded',
  'abandoned',
] as const);

export const ChronicleBeat = z.object({
  createdAt: z.number().int().nonnegative(),
  description: z.string().min(1),
  id: z.string().min(1),
  /** Turn sequence of the last turn that advanced this beat. */
  lastProgressTurn: z.number().int().nonnegative().optional(),
  resolvedAt: z.number().int().nonnegative().optional(),
  status: ChronicleBeatStatus,
  /** The beat that replaced this one; only on status `superseded`. */
  supersededBy: z.string().min(1).optional(),
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

const BeatChangeKind = z.enum(['advance', 'resolve', 'abandon']);

const BeatUpdateSchema = z.object({
  beatId: z.string().describe('Must match an existing beat ID.'),
  changeKind: BeatChangeKind.describe(
    'advance=progress; resolve=earned outcome; abandon=player moved against it or its premise is no longer true.'
  ),
  description: z
    .string()
    .optional()
    .nullable()
    .describe('New 1–2 sentence text if beat description changed.'),
  status: ChronicleBeatStatus.optional().nullable().describe(
    'New status. If resolve→succeeded/failed. If abandon→abandoned. If advance→in_progress or null.'
  )
});

const NewBeatSchema = z
  .object({
    description: z.string().describe('≤240 chars.'),
    supersedes: z
      .string()
      .optional()
      .nullable()
      .describe(
        'Existing beat ID this new beat replaces as the story\'s goal, when the new beat is where that goal drifted; else null.'
      ),
    title: z.string().describe('≤6 words.')
  })
  .nullable()
  .describe('Beat details if spawning new; else null.');

export const BeatTrackerSchema = z.object({
  focusBeatId: z
    .string()
    .nullable()
    .describe('Beat most affected; null if none exist.'),
  newBeat: NewBeatSchema,
  tags: z.array(z.string()).default([]),
  updates: z
    .array(BeatUpdateSchema)
    .describe('Only beats that changed; empty array if none.'),
});

export type BeatTracker = z.infer<typeof BeatTrackerSchema>;
