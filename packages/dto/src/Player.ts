import { z } from 'zod';

import { Metadata } from './Metadata';

export const PlayerTemplateVariant = z.object({
  label: z.string().min(1),
  objectKey: z.string().min(1),
  updatedAt: z.number().int(),
  variantId: z.string().min(1),
});

export type PlayerTemplateVariant = z.infer<typeof PlayerTemplateVariant>;

export const PlayerTemplateSlot = z.object({
  activeVariantId: z.string().min(1).optional(),
  nodeId: z.string().min(1),
  variants: z.array(PlayerTemplateVariant),
});

export type PlayerTemplateSlot = z.infer<typeof PlayerTemplateSlot>;

export const Player = z.object({
  loginId: z.string().min(1),
  metadata: Metadata.optional(),
  templateOverrides: z.record(z.string(), PlayerTemplateSlot).optional(),
});

export type Player = z.infer<typeof Player>;
