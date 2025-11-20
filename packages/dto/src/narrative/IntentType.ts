import { z } from 'zod';

export const IntentType = z.enum([
  'action',
  'inquiry',
  'clarification',
  'possibility',
  'planning',
  'reflection',
  'wrap'
]);

export type IntentType = z.infer<typeof IntentType>;

