import { z } from 'zod';
import { Metadata } from './Metadata';

export const PlayerTemplateVariant = z.object({
  variantId: z.string().min(1),
  label: z.string().min(1),
  objectKey: z.string().min(1),
  updatedAt: z.number().int(),
});

export type PlayerTemplateVariant = z.infer<typeof PlayerTemplateVariant>;

export const PlayerTemplateSlot = z.object({
  nodeId: z.string().min(1),
  activeVariantId: z.string().min(1).optional(),
  variants: z.array(PlayerTemplateVariant),
});

export type PlayerTemplateSlot = z.infer<typeof PlayerTemplateSlot>;

export const Player = z.object({
  loginId: z.string().min(1),
  templateOverrides: z.record(z.string(), PlayerTemplateSlot).optional(),
  metadata: Metadata.optional(),
});

export type Player = z.infer<typeof Player>;
