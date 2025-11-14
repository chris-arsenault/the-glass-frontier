import { z } from 'zod';

import { Attribute } from './mechanics';

const LocationStackEntry = z.object({
  id: z.string().min(1).optional(),
  kind: z.string().min(1),
  name: z.string().min(1),
});
export type LocationStackEntry = z.infer<typeof LocationStackEntry>;

export const Slot = z.enum(['outfit', 'headgear', 'armament', 'module']);
export type Slot = z.infer<typeof Slot>;

export const GearItem = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slot: Slot,
});
export type GearItem = z.infer<typeof GearItem>;

export const Relic = z.object({
  hook: z.string().min(1),
  id: z.string().min(1),
  name: z.string().min(1),
  unknown_usage: z.boolean().optional(),
});
export type Relic = z.infer<typeof Relic>;

export const ImbuedItem = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  registry_key: z.string().min(1),
  slot: Slot,
});
export type ImbuedItem = z.infer<typeof ImbuedItem>;

export const DataShard = z.discriminatedUnion('kind', [
  z.object({
    id: z.string().min(1),
    kind: z.literal('chronicle_active'),
    name: z.string().min(1),
    purpose: z.string().min(1),
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal('chronicle_hook'),
    locationId: z.string().min(1).optional(),
    locationStack: z.array(LocationStackEntry).optional(),
    name: z.string().min(1),
    seed: z.string().min(1),
    toneChips: z.array(z.string()).optional(),
    toneNotes: z.string().optional(),
  }),
]);
export type DataShard = z.infer<typeof DataShard>;

export const Consumable = z.object({
  count: z.number().int().nonnegative(),
  id: z.string().min(1),
  name: z.string().min(1),
});
export type Consumable = z.infer<typeof Consumable>;

export const SuppliesItem = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});
export type SuppliesItem = z.infer<typeof SuppliesItem>;

const GearSlots = z
  .object({
    armament: GearItem.optional(),
    headgear: GearItem.optional(),
    module: GearItem.optional(),
    outfit: GearItem.optional(),
  })
  .partial();

export const Inventory = z.object({
  consumables: z.array(Consumable).default([]),
  data_shards: z.array(DataShard).default([]),
  gear: GearSlots.default({}),
  imbued_items: z.array(ImbuedItem).default([]),
  relics: z.array(Relic).default([]),
  revision: z.number().int().nonnegative().default(0),
  supplies: z.array(SuppliesItem).default([]),
});
export type Inventory = z.infer<typeof Inventory>;

export const createEmptyInventory = (): Inventory => ({
  consumables: [],
  data_shards: [],
  gear: {},
  imbued_items: [],
  relics: [],
  revision: 0,
  supplies: [],
});

export const InventoryCollectionBuckets = [
  'relics',
  'imbued_items',
  'data_shards',
  'consumables',
  'supplies',
] as const;
export type InventoryCollectionBucket = (typeof InventoryCollectionBuckets)[number];

export const PendingEquip = z.union([
  z.object({
    itemId: z.string().min(1),
    slot: Slot,
  }),
  z.object({
    slot: Slot,
    unequip: z.literal(true),
  }),
]);
export type PendingEquip = z.infer<typeof PendingEquip>;

export const InventoryDeltaOp = z.object({
  amount: z.number().int().positive().optional().nullable(),
  bucket: z.enum(InventoryCollectionBuckets).optional().nullable(),
  hook: z.string().optional().nullable(),
  name: z.string().min(1).optional().nullable(),
  op: z.enum(['equip', 'unequip', 'add', 'remove', 'consume', 'spend_shard']),
  purpose: z.string().optional().nullable(),
  seed: z.string().optional().nullable(),
  slot: Slot.optional().nullable(),
});
export type InventoryDeltaOp = z.infer<typeof InventoryDeltaOp>;

export const InventoryDelta = z.object({
  nextRevision: z.number().int().nonnegative(),
  ops: z.array(InventoryDeltaOp).default([]),
  prevRevision: z.number().int().nonnegative(),
});
export type InventoryDelta = z.infer<typeof InventoryDelta>;

export const ImbuedRegistryEntry = z.object({
  attribute: Attribute,
  bonus: z.number().int(),
  description: z.string().optional().nullable(),
  key: z.string().min(1),
  name: z.string().min(1),
  slot: Slot,
  tags: z.array(z.string()).optional().nullable(),
});
export type ImbuedRegistryEntry = z.infer<typeof ImbuedRegistryEntry>;

export type ImbuedRegistry = Record<string, ImbuedRegistryEntry>;
