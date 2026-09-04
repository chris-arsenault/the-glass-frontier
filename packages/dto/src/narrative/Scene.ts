import { z } from 'zod';

export const SceneType = z.enum([
  'dialog',
  'battle',
  'hunt',
  'chase',
  'search',
]);
export type SceneType = z.infer<typeof SceneType>;

/** A scene has four consequential turns to answer its bounded question. */
export const SCENE_TURN_LIMIT = 4;

export const ActiveScene = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  threadId: z.string().min(1).nullable().default(null),
  turnsRemaining: z.number().int().min(0).max(SCENE_TURN_LIMIT).default(SCENE_TURN_LIMIT),
  type: SceneType,
});
export type ActiveScene = z.infer<typeof ActiveScene>;
