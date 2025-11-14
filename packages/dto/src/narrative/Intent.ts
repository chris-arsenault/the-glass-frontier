import { z } from 'zod';

import { Attribute } from '../mechanics';
import { Metadata } from '../Metadata';
import { IntentBeatDirective } from './ChronicleBeat';
import { IntentType as IntentTypeSchema } from './IntentType';

export const Intent = z.object({
  attribute: Attribute,
  beatDirective: IntentBeatDirective.optional(),
  creativeSpark: z.boolean(),
  handlerHints: z.array(z.string().min(1)).max(8).optional(),
  intentSummary: z.string(),
  intentType: IntentTypeSchema.optional(),
  metadata: Metadata,
  requiresCheck: z.boolean(),
  routerConfidence: z.number().min(0).max(1).optional(),
  routerRationale: z.string().optional(),
  skill: z.string(),
  tone: z.string(),
});
export type Intent = z.infer<typeof Intent>;
