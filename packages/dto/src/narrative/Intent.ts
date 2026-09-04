import { z } from 'zod';

import { Metadata } from '../Metadata';
import { IntentType as IntentTypeSchema } from './IntentType';
import { SceneType } from './Scene';

export const SceneDirective = z.discriminatedUnion('action', [
  z.object({ action: z.literal('continue') }),
  z.object({ action: z.literal('leave') }),
  z.object({
    action: z.literal('open'),
    question: z.string().min(1),
    type: SceneType,
  }),
]);
export type SceneDirective = z.infer<typeof SceneDirective>;

export const ThreadFocusDirective = z.discriminatedUnion('action', [
  z.object({ action: z.literal('keep') }),
  z.object({ action: z.literal('focus'), title: z.string().min(1) }),
  z.object({
    action: z.literal('create'),
    goal: z.string().min(1),
    title: z.string().min(1),
  }),
]);
export type ThreadFocusDirective = z.infer<typeof ThreadFocusDirective>;

export const Intent = z.object({
  creativeSpark: z.boolean(),
  intentSummary: z.string(),
  intentType: IntentTypeSchema,
  metadata: Metadata,
  scene: SceneDirective.default({ action: 'continue' }),
  thread: ThreadFocusDirective.default({ action: 'keep' }),
});
export type Intent = z.infer<typeof Intent>;
