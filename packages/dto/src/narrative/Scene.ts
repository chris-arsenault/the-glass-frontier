import { z } from 'zod';

import { HardStateKind } from '../world/HardState';

export const SceneType = z.enum([
  'dialog',
  'battle',
  'hunt',
  'chase',
  'search',
]);
export type SceneType = z.infer<typeof SceneType>;

/**
 * `complete` is a scene that reached its own conclusion; `abandoned` is a
 * scene whose premise dissolved — the story moved elsewhere and the scene
 * ends without an outcome.
 */
export const SceneOutcome = z.enum(['continue', 'complete', 'abandoned']);
export type SceneOutcome = z.infer<typeof SceneOutcome>;

/** How far a scene has progressed toward its conclusion before it must resolve. */
export const SCENE_CLOCK_TARGET = 4;

export const SceneChangeCandidate = z.object({
  subject: z.string().min(1),
  subjectKind: HardStateKind,
  type: SceneType,
});
export type SceneChangeCandidate = z.infer<typeof SceneChangeCandidate>;

export const SceneChange = SceneChangeCandidate.extend({
  subjectEntityId: z.string().uuid().optional(),
});
export type SceneChange = z.infer<typeof SceneChange>;

export const ChronicleScene = SceneChange.extend({
  id: z.string().min(1),
  /** Where the scene is set: the chronicle's location when it began. */
  location: z.string().min(1).optional(),
  /**
   * The scene clock: checks move it (breakthrough +2, advance +1, stall 0,
   * regress −1, collapse −2). A full clock means the scene must resolve.
   */
  progress: z.number().int().nonnegative().default(0),
  progressTarget: z.number().int().positive().default(SCENE_CLOCK_TARGET),
  startedAtTurn: z.number().int().nonnegative(),
});
export type ChronicleScene = z.infer<typeof ChronicleScene>;

export const SceneContext = SceneChange.extend({
  outcome: SceneOutcome,
  /** The model's stated reason for completing the scene, when it gave one. */
  outcomeReason: z.string().min(1).nullable().optional(),
  sceneId: z.string().min(1),
});
export type SceneContext = z.infer<typeof SceneContext>;
