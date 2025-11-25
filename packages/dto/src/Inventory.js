import { z } from 'zod';
export const InventoryEntryKindSchema = z.enum(['relic', 'consumable', 'supplies', 'gear']);
export const InventoryDeltaOpSchema = z
    .object({
    op: z.enum(['add', 'remove', 'update']),
    name: z.string().min(1),
    kind: InventoryEntryKindSchema,
    description: z.string().min(1),
    effect: z.string().min(1).optional().nullable(),
    quantity: z.number().int().nonnegative(),
});
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
export const InventorySchema = z.array(InventoryEntrySchema).default([]);
export const createEmptyInventory = () => [];
