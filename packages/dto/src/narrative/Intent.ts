import { z } from 'zod';

import { Attribute } from '../mechanics';
import { Metadata } from '../Metadata';
import { IntentBeatDirective } from './ChronicleBeat';

export const Intent = z.object({
  attribute: Attribute,
  beatDirective: IntentBeatDirective.optional(),
  creativeSpark: z.boolean(),
  intentSummary: z.string(),
  metadata: Metadata,
  requiresCheck: z.boolean(),
  skill: z.string(),
  tone: z.string(),
});
export type Intent = z.infer<typeof Intent>;
