import { z } from 'zod';

/**
 * What the scout hands the writer.
 *
 * The writer holds the things a paraphrase would break — the player's own
 * words, the check another node already decided, the scene clock, the item
 * manifest, the reply it wrote last turn — and this for everything else. The
 * scout is the only stage that has read both the chronicle and the world, so
 * it is the one that exercises judgement, and it does that here in prose
 * rather than by handing over a list for the writer to work out.
 *
 * The writer used to receive eleven raw context blocks and a brief synthesized
 * from those same blocks. Two authorities on one scene disagree eventually:
 * on The Silent Test the brief said Vask was present, CHARACTER said Hundson,
 * and the narration seated both of them.
 */
export const TurnBrief = z.object({
  /**
   * Who this person is, already translated out of the character sheet and into
   * how they behave here. The sheet's origins are four names — a species, a
   * culture, a homeland, an allegiance — and each of them is a canon entity
   * the writer never sees.
   */
  character: z.string().min(1)
    .describe('Who the player is in this world, written as how they behave here.'),
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
   * The story so far as it bears on this turn. The writer keeps last turn's
   * narration verbatim so it cannot contradict its own words; everything
   * before that is the scout's to read — through the turn index when the
   * player reaches back past the recent window — and to tell as one thing.
   */
  history: z.string().min(1).nullable()
    .describe('What has happened that bears on this turn; null on the first turn.'),
  /**
   * Where this happens and what it does to whoever stands in it. The writer's
   * old LOCATION block was a name, a kind, and one line of description.
   */
  location: z.string().min(1)
    .describe('Where this happens and what the place does to whoever is in it.'),
  /**
   * Who and what is in the scene, what each wants, and what canon says they
   * are like. This is what lets the world act instead of only reacting.
   */
  present: z.string().min(1)
    .describe('Who and what is in the scene, what they want, what they are like.'),
  /**
   * The scout's read of where the scene stands. Drives scene and beat state
   * through `applySceneRead`; the writer receives the scene's own record
   * instead, because a clock is a number and does not paraphrase.
   */
  scene: z.object({
    changed: z.string().min(1)
      .describe('What this turn changed about the situation, or that nothing changed.'),
    endsWhen: z.string().min(1)
      .describe('What would end this scene — the condition, not a guess at the outcome.'),
    stakes: z.string().min(1)
      .describe('What is at stake right now, in one line.'),
  }).describe('The scout\'s read of where the scene stands, as three short statements.'),
});
export type TurnBrief = z.infer<typeof TurnBrief>;
