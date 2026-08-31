import { z } from 'zod';

import { Metadata } from '../Metadata';
import { WorldReferenceSlug } from '../world/Encyclopedia';
import { ChronicleBeat } from './ChronicleBeat';
import { ChronicleSummaryEntry } from './ChronicleSummary';
import { EntityRosterState } from './EntityReference';
import { Front } from './Front';
import { ChronicleScene } from './Scene';
import { SceneLedger } from './SceneLedger';

const EntityFocusState = z.object({
  entityScores: z.record(z.string(), z.number()).default({}),
  tagScores: z.record(z.string(), z.number()).default({}),
});

export const ChronicleBranch = z.object({
  parentChronicleId: z.string().uuid(),
  parentTurnSequence: z.number().int().nonnegative(),
  rootChronicleId: z.string().uuid(),
  version: z.number().int().min(2),
});
export type ChronicleBranch = z.infer<typeof ChronicleBranch>;

export const Chronicle = z.object({
  activeScene: ChronicleScene.nullable().default(null),
  anchorEntityId: z.string().min(1).optional(),
  beats: z.array(ChronicleBeat).default([]),
  /** The source and version of a non-destructive branch. Originals omit it. */
  branch: ChronicleBranch.optional(),
  characterId: z.string().min(1).optional(),
  entityFocus: EntityFocusState.default({ entityScores: {}, tagScores: {} }),
  entityRoster: EntityRosterState,
  /** What the world is pursuing on its own account. Never player-facing state. */
  fronts: z.array(Front).default([]),
  id: z.string().min(1),
  /**
   * The canon place the chronicle started from, when it started from one.
   * Absent for a chronicle that began somewhere the world does not know about.
   * Play never changes it.
   */
  locationId: z.string().min(1).optional(),
  /** Where the chronicle is now. A name, nothing more. */
  locationName: z.string().min(1),
  metadata: Metadata.optional(),
  /** Encyclopedia entries actually named in the generated opening. */
  openingReferenceSlugs: z.array(WorldReferenceSlug).default([]),
  /** The GM-authored scene opener. The seed remains selection copy only. */
  openingText: z.string(),
  playerId: z.string().min(1),
  sceneLedger: SceneLedger.nullable().default(null),
  seedText: z.string().optional(),
  status: z.enum(['open', 'closed']).default('open'),
  summaries: z.array(ChronicleSummaryEntry).default([]),
  targetEndTurn: z.number().int().nonnegative().nullable().optional(),
  title: z.string().min(1),
  /** Tone the player asked for at creation; steers narration all game. */
  toneChips: z.array(z.string()).default([]),
  toneNotes: z.string().default(''),
});

export type Chronicle = z.infer<typeof Chronicle>;
