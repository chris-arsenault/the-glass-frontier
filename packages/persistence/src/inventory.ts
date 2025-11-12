import type {
  GearItem,
  ImbuedRegistry,
  Inventory,
  InventoryCollectionBucket,
  PendingEquip,
  Slot } from '@glass-frontier/dto';
import {
  Consumable,
  DataShard,
  ImbuedItem,
  Relic,
  SuppliesItem,
  createEmptyInventory,
} from '@glass-frontier/dto';

type InventoryOpOptions = {
  registry?: ImbuedRegistry | null;
};

const hasPendingEntries = (
  pending: PendingEquip[] | null | undefined
): pending is PendingEquip[] => Array.isArray(pending) && pending.length > 0;

export type InventoryStoreOp =
  | { op: 'equip'; slot: Slot; itemId: string }
  | { op: 'unequip'; slot: Slot }
  | { op: 'add'; bucket: InventoryCollectionBucket; item: unknown }
  | { op: 'remove'; bucket: InventoryCollectionBucket; itemId: string }
  | { op: 'consume'; itemId: string; amount: number }
  | { op: 'spend_shard'; itemId: string };

export type InventoryStoreDelta = {
  ops: InventoryStoreOp[];
  prevRevision: number;
  nextRevision: number;
}

type InventoryOperationHandlers = {
  [K in InventoryStoreOp['op']]: (
    inventory: Inventory,
    op: Extract<InventoryStoreOp, { op: K }>,
    options?: InventoryOpOptions
  ) => void;
};

const operationHandlers: InventoryOperationHandlers = {
  add: (working, op) => {
    applyBucketAdd(working, op.bucket, op.item);
  },
  consume: (working, op) => {
    applyConsumableUse(working, op.itemId, op.amount);
  },
  equip: (working, op, options) => {
    const gearItem = buildGearItem(working, op.slot, op.itemId, options?.registry ?? null);
    if (gearItem === null) {
      throw new Error(`inventory_equip_invalid_item:${op.itemId}`);
    }
    working.gear = updateGearSlot(working.gear, op.slot, gearItem);
  },
  remove: (working, op) => {
    applyBucketRemove(working, op.bucket, op.itemId);
  },
  spend_shard: (working, op) => {
    working.data_shards = working.data_shards.filter((item) => item.id !== op.itemId);
  },
  unequip: (working, op) => {
    const equipped = readGearSlot(working.gear, op.slot);
    if (equipped === undefined) {
      return;
    }
    working.gear = updateGearSlot(working.gear, op.slot, undefined);
  },
};

const getBucketSchema = (
  bucket: InventoryCollectionBucket
): typeof Relic | typeof ImbuedItem | typeof DataShard | typeof Consumable | typeof SuppliesItem => {
  switch (bucket) {
  case 'consumables':
    return Consumable;
  case 'data_shards':
    return DataShard;
  case 'imbued_items':
    return ImbuedItem;
  case 'relics':
    return Relic;
  case 'supplies':
    return SuppliesItem;
  default:
    throw new Error(`Unknown inventory bucket schema requested: ${bucket}`);
  }
};

const updateBucketEntries = (
  inventory: Inventory,
  bucket: InventoryCollectionBucket,
  updater: (current: Array<{ id: string }>) => Array<{ id: string }>
): void => {
  switch (bucket) {
  case 'consumables':
    inventory.consumables = updater(inventory.consumables) as Consumable[];
    return;
  case 'data_shards':
    inventory.data_shards = updater(inventory.data_shards) as DataShard[];
    return;
  case 'imbued_items':
    inventory.imbued_items = updater(inventory.imbued_items) as ImbuedItem[];
    return;
  case 'relics':
    inventory.relics = updater(inventory.relics) as Relic[];
    return;
  case 'supplies':
    inventory.supplies = updater(inventory.supplies) as SuppliesItem[];
    return;
  default:
    throw new Error(`Unknown inventory bucket: ${bucket}`);
  }
};

const updateGearSlot = (
  gear: Inventory['gear'],
  slot: Slot,
  item: GearItem | undefined
): Inventory['gear'] => {
  switch (slot) {
  case 'armament':
    return { ...gear, armament: item };
  case 'headgear':
    return { ...gear, headgear: item };
  case 'module':
    return { ...gear, module: item };
  case 'outfit':
    return { ...gear, outfit: item };
  default:
    return gear;
  }
};

const readGearSlot = (gear: Inventory['gear'], slot: Slot): GearItem | undefined => {
  switch (slot) {
  case 'armament':
    return gear.armament;
  case 'headgear':
    return gear.headgear;
  case 'module':
    return gear.module;
  case 'outfit':
    return gear.outfit;
  default:
    return undefined;
  }
};

export const normalizeInventory = (source?: Inventory | null): Inventory => {
  if (source === null || source === undefined) {
    return createEmptyInventory();
  }
  return {
    consumables: [...(source.consumables ?? [])],
    data_shards: [...(source.data_shards ?? [])],
    gear: { ...(source.gear ?? {}) },
    imbued_items: [...(source.imbued_items ?? [])],
    relics: [...(source.relics ?? [])],
    revision: source.revision ?? 0,
    supplies: [...(source.supplies ?? [])],
  };
};

export const applyPendingEquipQueue = (
  inventory: Inventory,
  pending: PendingEquip[] | null | undefined,
  options?: InventoryOpOptions
): { inventory: Inventory; ops: InventoryStoreOp[] } => {
  if (!hasPendingEntries(pending)) {
    return { inventory, ops: [] };
  }
  const next = normalizeInventory(inventory);
  const ops: InventoryStoreOp[] = [];
  for (const entry of pending) {
    processPendingEquipEntry(next, entry, ops, options?.registry ?? null);
  }
  return { inventory: next, ops };
};

const processPendingEquipEntry = (
  inventory: Inventory,
  entry: PendingEquip,
  ops: InventoryStoreOp[],
  registry: ImbuedRegistry | null
): void => {
  if (isUnequipPending(entry)) {
    handlePendingUnequip(inventory, entry, ops);
    return;
  }
  handlePendingEquip(inventory, entry, ops, registry);
};

const handlePendingUnequip = (
  inventory: Inventory,
  entry: PendingEquip & { unequip: true },
  ops: InventoryStoreOp[]
): void => {
  const equipped = readGearSlot(inventory.gear, entry.slot);
  if (equipped === undefined) {
    return;
  }
  inventory.gear = updateGearSlot(inventory.gear, entry.slot, undefined);
  ops.push({ op: 'unequip', slot: entry.slot });
};

const handlePendingEquip = (
  inventory: Inventory,
  entry: PendingEquip & { itemId: string },
  ops: InventoryStoreOp[],
  registry: ImbuedRegistry | null
): void => {
  const gearItem = buildGearItem(inventory, entry.slot, entry.itemId, registry);
  if (gearItem === null) {
    return;
  }
  const alreadyEquipped = readGearSlot(inventory.gear, entry.slot);
  if (alreadyEquipped !== undefined && alreadyEquipped.id === gearItem.id) {
    return;
  }
  inventory.gear = updateGearSlot(inventory.gear, entry.slot, gearItem);
  ops.push({ itemId: entry.itemId, op: 'equip', slot: entry.slot });
};

export const applyInventoryOperations = (
  inventory: Inventory,
  ops: InventoryStoreOp[],
  options?: InventoryOpOptions
): Inventory => {
  if (ops.length === 0) {
    return normalizeInventory(inventory);
  }
  const working = normalizeInventory(inventory);

  for (const op of ops) {
    const handler = operationHandlers[op.op] as (
      target: Inventory,
      operation: InventoryStoreOp,
      handlerOptions?: InventoryOpOptions
    ) => void;
    handler(working, op, options);
  }

  return working;
};

export const resolveInventoryDelta = (
  inventory: Inventory | null | undefined,
  delta: InventoryStoreDelta,
  options?: InventoryOpOptions
): Inventory => {
  const baseline = normalizeInventory(inventory);
  if (baseline.revision !== delta.prevRevision) {
    throw new Error(
      `inventory_revision_conflict: expected=${baseline.revision} provided=${delta.prevRevision}`
    );
  }
  if (delta.ops.length > 0 && delta.nextRevision <= delta.prevRevision) {
    throw new Error('inventory_revision_not_advanced');
  }
  const applied = applyInventoryOperations(baseline, delta.ops, options);
  return {
    ...applied,
    revision: delta.ops.length > 0 ? delta.nextRevision : baseline.revision,
  };
};

const buildGearItem = (
  inventory: Inventory,
  slot: Slot,
  itemId: string,
  registry?: ImbuedRegistry | null
): GearItem | null => {
  const existing = readGearSlot(inventory.gear, slot);
  if (existing !== undefined && existing.id === itemId) {
    return existing;
  }
  const imbued = inventory.imbued_items.find((item) => item.id === itemId);
  if (imbued !== undefined) {
    const inferredSlot = imbued.slot ?? registry?.[imbued.registry_key]?.slot ?? slot;
    return {
      id: imbued.id,
      name: imbued.name,
      slot: inferredSlot,
    };
  }
  return null;
};

const applyBucketAdd = (
  inventory: Inventory,
  bucket: InventoryCollectionBucket,
  raw: unknown
): void => {
  const schema = getBucketSchema(bucket);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`inventory_add_invalid_payload:${bucket}`);
  }
  const item = parsed.data;
  updateBucketEntries(inventory, bucket, (current) => {
    const filtered = current.filter((entry) => entry.id !== item.id);
    return [...filtered, item];
  });
};

const applyBucketRemove = (
  inventory: Inventory,
  bucket: InventoryCollectionBucket,
  itemId: string
): void => {
  updateBucketEntries(inventory, bucket, (current) =>
    current.filter((entry) => entry.id !== itemId)
  );
};

const applyConsumableUse = (inventory: Inventory, itemId: string, amount: number): void => {
  if (amount <= 0) {
    return;
  }
  const updated: Consumable[] = [];
  for (const entry of inventory.consumables) {
    if (entry.id !== itemId) {
      updated.push(entry);
      continue;
    }
    const remaining = Math.max(0, entry.count - amount);
    if (remaining > 0) {
      updated.push({ ...entry, count: remaining });
    }
  }
  inventory.consumables = updated;
};

const isUnequipPending = (entry: PendingEquip): entry is PendingEquip & { unequip: true } =>
  'unequip' in entry && entry.unequip === true;
