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

export const SceneOutcome = z.enum(['continue', 'complete']);
export type SceneOutcome = z.infer<typeof SceneOutcome>;

export const SceneChange = z.object({
  subject: z.string().min(1),
  subjectKind: HardStateKind,
  type: SceneType,
});
export type SceneChange = z.infer<typeof SceneChange>;

export const ChronicleScene = SceneChange.extend({
  id: z.string().min(1),
  startedAtTurn: z.number().int().nonnegative(),
});
export type ChronicleScene = z.infer<typeof ChronicleScene>;

export const SceneContext = SceneChange.extend({
  outcome: SceneOutcome,
  sceneId: z.string().min(1),
});
export type SceneContext = z.infer<typeof SceneContext>;
