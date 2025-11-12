import { z } from 'zod';
import { Attribute } from './mechanics';

export const Slot = z.enum(['outfit', 'headgear', 'armament', 'module']);
export type Slot = z.infer<typeof Slot>;

export const GearItem = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slot: Slot,
});
export type GearItem = z.infer<typeof GearItem>;

export const Relic = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  hook: z.string().min(1),
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
    kind: z.literal('chronicle_active'),
    id: z.string().min(1),
    name: z.string().min(1),
    purpose: z.string().min(1),
  }),
  z.object({
    kind: z.literal('chronicle_hook'),
    id: z.string().min(1),
    name: z.string().min(1),
    seed: z.string().min(1),
  }),
]);
export type DataShard = z.infer<typeof DataShard>;

export const Consumable = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  count: z.number().int().nonnegative(),
});
export type Consumable = z.infer<typeof Consumable>;

export const SuppliesItem = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});
export type SuppliesItem = z.infer<typeof SuppliesItem>;

const GearSlots = z
  .object({
    outfit: GearItem.optional(),
    headgear: GearItem.optional(),
    armament: GearItem.optional(),
    module: GearItem.optional(),
  })
  .partial();

export const Inventory = z.object({
  revision: z.number().int().nonnegative().default(0),
  gear: GearSlots.default({}),
  relics: z.array(Relic).default([]),
  imbued_items: z.array(ImbuedItem).default([]),
  data_shards: z.array(DataShard).default([]),
  consumables: z.array(Consumable).default([]),
  supplies: z.array(SuppliesItem).default([]),
});
export type Inventory = z.infer<typeof Inventory>;

export const createEmptyInventory = (): Inventory => ({
  revision: 0,
  gear: {},
  relics: [],
  imbued_items: [],
  data_shards: [],
  consumables: [],
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
    slot: Slot,
    itemId: z.string().min(1),
  }),
  z.object({
    slot: Slot,
    unequip: z.literal(true),
  }),
]);
export type PendingEquip = z.infer<typeof PendingEquip>;

export const InventoryDeltaOp = z.object({
  op: z.enum(['equip', 'unequip', 'add', 'remove', 'consume', 'spend_shard']),
  slot: Slot.optional(),
  bucket: z.enum(InventoryCollectionBuckets).optional(),
  name: z.string().min(1).optional(),
  hook: z.string().optional(),
  purpose: z.string().optional(),
  seed: z.string().optional(),
  amount: z.number().int().positive().optional(),
});
export type InventoryDeltaOp = z.infer<typeof InventoryDeltaOp>;

export const InventoryDelta = z.object({
  ops: z.array(InventoryDeltaOp).default([]),
  prevRevision: z.number().int().nonnegative(),
  nextRevision: z.number().int().nonnegative(),
});
export type InventoryDelta = z.infer<typeof InventoryDelta>;

export const ImbuedRegistryEntry = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  slot: Slot,
  attribute: Attribute,
  bonus: z.number().int(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});
export type ImbuedRegistryEntry = z.infer<typeof ImbuedRegistryEntry>;

export type ImbuedRegistry = Record<string, ImbuedRegistryEntry>;
