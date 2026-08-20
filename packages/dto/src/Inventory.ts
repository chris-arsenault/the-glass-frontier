import { z } from 'zod';

export const InventoryEntryKindSchema = z.enum(['relic', 'consumable', 'supplies', 'gear']);
export type InventoryEntryKind = z.infer<typeof InventoryEntryKindSchema>;

export const InventoryDeltaOpSchema = z
  .object({
    description: z.string().min(1),
    effect: z.string().min(1).optional().nullable(),
    kind: InventoryEntryKindSchema,
    name: z.string().min(1),
    op: z.enum(['add', 'remove', 'update']),
    quantity: z.number().int().nonnegative(),
  });

export type InventoryDeltaOp = z.infer<typeof InventoryDeltaOpSchema>;

export const InventoryDeltaSchema = z.object({
  ops: z.array(InventoryDeltaOpSchema).default([]),
});

export type InventoryDelta = z.infer<typeof InventoryDeltaSchema>;


export const InventoryEntrySchema = z.object({
  description: z.string().min(1),
  effect: z.string().min(1).optional(),
  id: z.string().min(1),
  kind: InventoryEntryKindSchema,
  name: z.string().min(1),
  quantity: z.number().int().nonnegative().default(1),
});

export type InventoryEntry = z.infer<typeof InventoryEntrySchema>;

export const InventorySchema = z.array(InventoryEntrySchema).default([]);

export type Inventory = z.infer<typeof InventorySchema>;

export const createEmptyInventory = (): Inventory => [];
