import { z } from 'zod';

import { Metadata } from '../Metadata';
import { IntentBeatDirective } from './ChronicleBeat';
import { IntentType as IntentTypeSchema } from './IntentType';
import { SceneChange } from './Scene';

export const Intent = z.object({
  beatDirective: IntentBeatDirective,
  creativeSpark: z.boolean(),
  handlerHints: z.array(z.string().min(1)).max(8),
  intentSummary: z.string(),
  intentType: IntentTypeSchema,
  metadata: Metadata,
  routerRationale: z.string(),
  sceneChange: SceneChange.nullable().default(null),
  /**
   * Why this turn does or does not open a typed scene. Required every turn so
   * the classifier has to weigh the question, and so a chronicle that never
   * reaches a battle or dialog scene says why in its own words.
   */
  sceneRationale: z.string(),
  tone: z.string(),
});
export type Intent = z.infer<typeof Intent>;
