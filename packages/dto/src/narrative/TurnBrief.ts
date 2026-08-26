import { z } from 'zod';

/**
 * What the scout hands the writer.
 *
 * Retrieval and prose used to be one call: the model held the world index, the
 * tool schemas, the retrieval policy, and the narration instructions at once,
 * and the prose competed with all of it for attention. The scout does the
 * looking and writes down only what bears on this turn; the writer receives
 * this and nothing about retrieval at all.
 */
export const TurnBrief = z.object({
  /**
   * The turn's fallout, written after the dice are known and grounded in
   * retrieved material rather than in generic weather. Null when the turn
   * went well enough not to need one.
   */
  complication: z.string().min(1).nullable()
    .describe('One grounded complication when the check went badly; null otherwise.'),
  /** Provenance: canon entities whose material the scout actually opened. */
  entities: z.array(z.object({
    emergentTags: z.array(z.string()).default([]),
    entitySlug: z.string().min(1)
      .describe('The entity\'s slug exactly as the index or tools spelled it.'),
    usage: z.enum(['mentioned', 'central']),
  })),
  /**
   * Established world material this turn should use, in the scout's own words
   * — one line each, already selected. Not transcription: the line is what
   * matters about the fact, not the fact's whole entry.
   */
  material: z.array(z.string().min(1)).max(6)
    .describe('Up to six lines of retrieved canon that bear on this turn.'),
  /**
   * Who and what is in the scene, and what each of them is after. The writer
   * needs this to let someone other than the player act.
   */
  present: z.array(z.string().min(1)).max(6)
    .describe('Who or what is present, each with what it wants right now.'),
  /** The scout's read of where the scene stands. Drives scene and beat state. */
  scene: z.object({
    /** What this turn changed about the situation, or that nothing changed. */
    changed: z.string().min(1),
    /** What would end this scene — the condition, not a guess at the outcome. */
    endsWhen: z.string().min(1),
    /** What is at stake right now, in one line. */
    stakes: z.string().min(1),
  }),
});
export type TurnBrief = z.infer<typeof TurnBrief>;
