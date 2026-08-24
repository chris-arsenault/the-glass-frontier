import { z } from 'zod';

import { Metadata } from '../Metadata';
import { ChronicleBeat } from './ChronicleBeat';
import { ChronicleSummaryEntry } from './ChronicleSummary';
import { EntityRosterState } from './EntityReference';
import { ChronicleScene } from './Scene';
import { SceneLedger } from './SceneLedger';

const EntityFocusState = z.object({
  entityScores: z.record(z.string(), z.number()).default({}),
  tagScores: z.record(z.string(), z.number()).default({}),
});

export const Chronicle = z.object({
  activeScene: ChronicleScene.nullable().default(null),
  anchorEntityId: z.string().min(1).optional(),
  beats: z.array(ChronicleBeat).default([]),
  characterId: z.string().min(1).optional(),
  entityFocus: EntityFocusState.default({ entityScores: {}, tagScores: {} }),
  entityRoster: EntityRosterState,
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
