import { z } from 'zod';

/**
 * The GM's working memory for the current scene: what kind of place this is,
 * who and what is present, and what has just happened between them. It is
 * maintained turn to turn by a classifier pass, fed back to every narrator and
 * judge, and kept out of the narration itself, so the setting stays consistent
 * without being restated. Facts here bind the fiction the way canon does, at
 * scene scope.
 */
export const SceneLedgerPresence = z.object({
  /** Current state and disposition, one compact sentence. */
  detail: z.string().min(1),
  name: z.string().min(1),
});
export type SceneLedgerPresence = z.infer<typeof SceneLedgerPresence>;

export const SceneLedgerPlace = z.object({
  /** Established setting facts, accumulated: layout, features, atmosphere. */
  detail: z.string().min(1),
  /** What kind of place this is: hostel, freighter hold, market square. */
  kind: z.string().min(1),
  name: z.string().min(1),
});
export type SceneLedgerPlace = z.infer<typeof SceneLedgerPlace>;

export const SceneLedger = z.object({
  /** Recent notable interactions, oldest first, capped. */
  interactions: z.array(z.string().min(1)).default([]),
  place: SceneLedgerPlace.nullable().default(null),
  present: z.array(SceneLedgerPresence).default([]),
  updatedAtTurn: z.number().int().nonnegative(),
});
export type SceneLedger = z.infer<typeof SceneLedger>;

export const SCENE_LEDGER_INTERACTION_CAP = 8;
export const SCENE_LEDGER_PRESENCE_CAP = 10;
