import { z } from 'zod';

/** One clock movement, with the reason it moved. */
const FrontTick = z.object({
  frontId: z.string().min(1),
  /** Segments to add. Zero when the front held still this turn. */
  segments: z.number().int().min(0).max(3),
  /** What in the fiction moved it. Empty reasons are how clocks become weather. */
  why: z.string().min(1),
});

/** A new agenda, always anchored to an entity that already exists in canon. */
const FrontProposal = z.object({
  agentSlug: z.string().min(1)
    .describe('The canon entity pursuing this, by the slug the index or tools gave you.'),
  intent: z.string().min(1).describe('What it is trying to bring about, in one line.'),
  nextSign: z.string().min(1)
    .describe('What the player would notice next if they were paying attention.'),
  size: z.number().int().min(2).max(8)
    .describe('Clock segments. Bigger is slower and lands harder.'),
});

/**
 * What the GM decides the world is doing, before the player's action is
 * planned or rolled.
 *
 * The world used to exist only as a reaction: every event in a chronicle
 * traced back to a verb the player had just supplied. This is the turn's
 * record of what everything that is not the player was doing, whether or not
 * the narration ends up showing any of it.
 */
export const WorldTurn = z.object({
  /**
   * Fronts whose premise no longer holds — the thing was already achieved by
   * other means, the pursuer is gone, the fiction moved somewhere the agenda
   * cannot follow. Without this an agenda that has quietly become nonsense
   * holds one of three slots until a clock it will never fill runs out.
   */
  abandonedFrontIds: z.array(z.string().min(1)).max(3).default([]),
  /**
   * At most one front may fire on a turn. A firing front is one whose clock
   * has filled and whose consequence arrives now.
   */
  firedFrontId: z.string().min(1).nullable().default(null),
  /** A new agenda worth tracking, or null when the world is busy enough. */
  proposal: FrontProposal.nullable().default(null),
  /** Movement on the live agendas, one entry per front the world touched. */
  ticks: z.array(FrontTick).max(3).default([]),
  /**
   * What the world is doing right now, in the GM's voice and in the present
   * tense. Two or three sentences: who is moving, what they are after, what
   * changed while the player was occupied. Not narration — the writer decides
   * what the camera catches.
   *
   * The description is load-bearing. Without it the model reads a field named
   * `world` beside a LOCATION block and a SCENE carrying `currentLocation`,
   * and answers the question it looks like: on Radiators Raised in Daylight
   * turns 3 and 4 it returned the single word "Ashvane" and the world's whole
   * account of itself was lost.
   */
  world: z.string().min(1)
    .describe(
      'Two or three sentences of what everything that is not the player is '
      + 'doing right now: who is moving, what they are after, what shifted '
      + 'while the player was occupied. Present tense, prose, never a place '
      + 'name and never a summary of the player\'s action.'
    ),
});
export type WorldTurn = z.infer<typeof WorldTurn>;
