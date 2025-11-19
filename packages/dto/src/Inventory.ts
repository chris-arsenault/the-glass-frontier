import { z } from 'zod';

export const InventoryEntryKindSchema = z.enum(['relic', 'consumable', 'supplies', 'gear']);
export type InventoryEntryKind = z.infer<typeof InventoryEntryKindSchema>;

export const InventoryDeltaOpSchema = z
  .object({
    op: z.enum(['add', 'remove', 'update', 'consume']),
    name: z.string().min(1),
    kind: InventoryEntryKindSchema.optional().nullable(),
    description: z.string().min(1).optional().nullable(),
    effect: z.string().min(1).optional().nullable(),
    quantity: z.number().int().nonnegative().optional().nullable(),
  });

export type InventoryDeltaOp = z.infer<typeof InventoryDeltaOpSchema>;

export const InventoryDeltaSchema = z.object({
  ops: z.array(InventoryDeltaOpSchema).default([]),
});


export const InventoryEntrySchema = z.object({
  id: z.string().min(1),
  kind: InventoryEntryKindSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  effect: z.string().min(1).optional(),
  quantity: z.number().int().nonnegative().default(1),
});

export type InventoryEntry = z.infer<typeof InventoryEntrySchema>;

export const InventorySchema = z.array(InventoryEntrySchema).default([]);

export type Inventory = z.infer<typeof InventorySchema>;
