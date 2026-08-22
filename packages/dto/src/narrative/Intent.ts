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
  tone: z.string(),
});
export type Intent = z.infer<typeof Intent>;
