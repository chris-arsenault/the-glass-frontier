import { z } from 'zod';

import { Metadata } from '../Metadata';
import { IntentType as IntentTypeSchema } from './IntentType';

export const Intent = z.object({
  creativeSpark: z.boolean(),
  handlerHints: z.array(z.string().min(1)).max(8),
  intentSummary: z.string(),
  intentType: IntentTypeSchema,
  metadata: Metadata,
  routerRationale: z.string(),
  tone: z.string(),
});
export type Intent = z.infer<typeof Intent>;
