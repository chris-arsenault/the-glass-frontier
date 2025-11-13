import type {
  Consumable,
  DataShard,
  ImbuedItem,
  ImbuedRegistry,
  Inventory,
  InventoryCollectionBucket,
  InventoryDelta,
  Relic,
  Slot,
  SuppliesItem,
} from '@glass-frontier/dto';
import {
  applyInventoryOperations,
  normalizeInventory,
  type InventoryStoreOp,
} from '@glass-frontier/persistence';
import { randomUUID } from 'node:crypto';

type InventoryOp = InventoryDelta['ops'][number];

export type ConvertedDelta = {
  displayOps: InventoryDelta['ops'];
  inventory: Inventory;
  storeOps: InventoryStoreOp[];
};

export const describeStoreOperations = (
  ops: InventoryStoreOp[],
  startingInventory: Inventory,
  registry: ImbuedRegistry
): InventoryDelta['ops'] => {
  if (ops.length === 0) {
    return [];
  }

  let preview = normalizeInventory(startingInventory);
  const descriptions: InventoryDelta['ops'] = [];

  for (const op of ops) {
    const next = applyInventoryOperations(preview, [op], { registry });
    const description = describeStoreOp(op, preview, next);
    if (description !== null) {
      descriptions.push(description);
    }
    preview = next;
  }

  return descriptions;
};

export const convertFlatDelta = (
  delta: InventoryDelta,
  startingInventory: Inventory,
  registry: ImbuedRegistry
): ConvertedDelta => {
  const storeOps: InventoryStoreOp[] = [];
  const displayOps: InventoryDelta['ops'] = [];
  let preview = normalizeInventory(startingInventory);
  const operations = Array.isArray(delta.ops) ? delta.ops : [];

  for (const op of operations) {
    const storeOp = convertFlatOp(op, preview, registry);
    const next = applyInventoryOperations(preview, [storeOp], { registry });
    const description = describeStoreOp(storeOp, preview, next);
    if (description !== null) {
      displayOps.push(description);
    }
    storeOps.push(storeOp);
    preview = next;
  }

  return { displayOps, inventory: preview, storeOps };
};

const convertFlatOp = (
  op: InventoryOp,
  inventory: Inventory,
  registry: ImbuedRegistry
): InventoryStoreOp => {
  switch (op.op) {
  case 'equip':
    return convertEquipOp(op, inventory);
  case 'unequip':
    return convertUnequipOp(op);
  case 'add':
    return convertAddOp(op, registry);
  case 'remove':
    return convertRemoveOp(op, inventory);
  case 'consume':
    return convertConsumeOp(op, inventory);
  case 'spend_shard':
    return convertSpendShardOp(op, inventory);
  default:
    throw new Error(`inventory_op_not_supported:${String(op.op)}`);
  }
};

const convertEquipOp = (op: InventoryOp, inventory: Inventory): InventoryStoreOp => {
  const slot = requireSlot(op);
  const name = requireName(op);
  const itemId = findItemIdByName(inventory, 'imbued_items', name);
  if (itemId === null) {
    throw new Error(`inventory_unknown_item:${name}`);
  }
  return { itemId, op: 'equip', slot };
};

const convertUnequipOp = (op: InventoryOp): InventoryStoreOp => {
  const slot = requireSlot(op);
  return { op: 'unequip', slot };
};

const convertAddOp = (op: InventoryOp, registry: ImbuedRegistry): InventoryStoreOp => {
  const bucket = requireBucket(op);
  const name = requireName(op);
  const item = buildItemForBucket(bucket, { ...op, name }, registry);
  return { bucket, item, op: 'add' };
};

const convertRemoveOp = (op: InventoryOp, inventory: Inventory): InventoryStoreOp => {
  const bucket = requireBucket(op);
  const name = requireName(op);
  const itemId = findItemIdByName(inventory, bucket, name);
  if (itemId === null) {
    throw new Error(`inventory_unknown_item:${name}`);
  }
  return { bucket, itemId, op: 'remove' };
};

const convertConsumeOp = (op: InventoryOp, inventory: Inventory): InventoryStoreOp => {
  const amount = requireAmount(op);
  const name = requireName(op);
  const itemId = findItemIdByName(inventory, 'consumables', name);
  if (itemId === null) {
    throw new Error(`inventory_unknown_consumable:${name}`);
  }
  return { amount, itemId, op: 'consume' };
};

const convertSpendShardOp = (op: InventoryOp, inventory: Inventory): InventoryStoreOp => {
  const name = requireName(op);
  const itemId = findItemIdByName(inventory, 'data_shards', name);
  if (itemId === null) {
    throw new Error(`inventory_unknown_shard:${name}`);
  }
  return { itemId, op: 'spend_shard' };
};

type StoreOpHandler = (
  op: InventoryStoreOp,
  before: Inventory,
  after: Inventory
) => InventoryOp | null;

const storeOpHandlers: Record<InventoryStoreOp['op'], StoreOpHandler> = {
  add: (op) => describeBucketItem('add', op.bucket, op.item),
  consume: (op, before) => describeConsumeOp(op as Extract<InventoryStoreOp, { op: 'consume' }>, before),
  equip: (_op, _before, after) => {
    const typed = _op as Extract<InventoryStoreOp, { op: 'equip' }>;
    return {
      name: after.gear?.[typed.slot]?.name,
      op: 'equip',
      slot: typed.slot,
    };
  },
  remove: (op, before) =>
    describeBucketItem('remove', op.bucket, findBucketItemById(before, op.bucket, op.itemId)),
  spend_shard: (op, before) =>
    describeSpendShardOp(op as Extract<InventoryStoreOp, { op: 'spend_shard' }>, before),
  unequip: (op, before) => {
    const typed = op as Extract<InventoryStoreOp, { op: 'unequip' }>;
    return {
      name: before.gear?.[typed.slot]?.name,
      op: 'unequip',
      slot: typed.slot,
    };
  },
};

const describeStoreOp = (
  op: InventoryStoreOp,
  before: Inventory,
  after: Inventory
): InventoryOp | null => {
  const handler = storeOpHandlers[op.op];
  if (handler === undefined) {
    return null;
  }
  return handler(op, before, after);
};

const describeConsumeOp = (
  op: Extract<InventoryStoreOp, { op: 'consume' }>,
  before: Inventory
): InventoryOp => {
  const item = findBucketItemById(before, 'consumables', op.itemId) as Consumable | null;
  return {
    amount: op.amount,
    bucket: 'consumables',
    name: item?.name,
    op: 'consume',
  };
};

const describeSpendShardOp = (
  op: Extract<InventoryStoreOp, { op: 'spend_shard' }>,
  before: Inventory
): InventoryOp | null => {
  const shard = findBucketItemById(before, 'data_shards', op.itemId) as DataShard | null;
  if (shard === null) {
    return null;
  }
  return {
    bucket: 'data_shards',
    name: shard.name,
    op: 'spend_shard',
    purpose: shard.kind === 'chronicle_active' ? shard.purpose : undefined,
    seed: shard.kind === 'chronicle_hook' ? shard.seed : undefined,
  };
};

const describeBucketItem = (
  op: 'add' | 'remove',
  bucket: InventoryCollectionBucket,
  item: unknown
): InventoryOp | null => {
  if (item === undefined || item === null) {
    return null;
  }

  switch (bucket) {
  case 'relics':
    return describeRelicBucketItem(item as Relic, op);
  case 'imbued_items':
    return describeImbuedBucketItem(item as ImbuedItem, op);
  case 'data_shards':
    return describeDataShardBucketItem(item as DataShard, op);
  case 'consumables':
    return describeConsumableBucketItem(item as Consumable, op);
  case 'supplies':
    return describeSupplyBucketItem(item as SuppliesItem, op);
  default:
    return null;
  }
};

const describeRelicBucketItem = (relic: Relic, op: 'add' | 'remove'): InventoryOp => ({
  bucket: 'relics',
  hook: relic.hook,
  name: relic.name,
  op,
});

const describeImbuedBucketItem = (imbued: ImbuedItem, op: 'add' | 'remove'): InventoryOp => ({
  bucket: 'imbued_items',
  name: imbued.name,
  op,
  slot: imbued.slot,
});

const describeDataShardBucketItem = (shard: DataShard, op: 'add' | 'remove'): InventoryOp => ({
  bucket: 'data_shards',
  name: shard.name,
  op,
  purpose: shard.kind === 'chronicle_active' ? shard.purpose : undefined,
  seed: shard.kind === 'chronicle_hook' ? shard.seed : undefined,
});

const describeConsumableBucketItem = (consumable: Consumable, op: 'add' | 'remove'): InventoryOp => ({
  bucket: 'consumables',
  name: consumable.name,
  op,
});

const describeSupplyBucketItem = (supply: SuppliesItem, op: 'add' | 'remove'): InventoryOp => ({
  bucket: 'supplies',
  name: supply.name,
  op,
});

const buildItemForBucket = (
  bucket: InventoryCollectionBucket,
  op: { name: string; hook?: string; purpose?: string; seed?: string; slot?: Slot | null },
  registry: ImbuedRegistry
): unknown => {
  switch (bucket) {
  case 'relics':
    return buildRelic(op);
  case 'imbued_items':
    return buildImbuedItem(op, registry);
  case 'data_shards':
    return buildDataShard(op);
  case 'consumables':
    return buildConsumable(op);
  case 'supplies':
    return buildSupply(op);
  default:
    throw new Error(`inventory_unknown_bucket:${bucket}`);
  }
};

const buildRelic = (op: { name: string; hook?: string }): Relic => {
  const hook = requireNonEmpty(op.hook, 'inventory_missing_hook');
  return {
    hook,
    id: randomUUID(),
    name: op.name,
  };
};

const buildImbuedItem = (
  op: { name: string },
  registry: ImbuedRegistry
): ImbuedItem => {
  const entry = matchRegistryEntry(op.name, registry);
  if (entry === null) {
    throw new Error(`inventory_unknown_imbued:${op.name}`);
  }
  return {
    id: randomUUID(),
    name: entry.name,
    registry_key: entry.key,
    slot: entry.slot,
  };
};

const buildDataShard = (op: { name: string; purpose?: string; seed?: string }): DataShard => {
  if (isNonEmptyString(op.purpose)) {
    return {
      id: randomUUID(),
      kind: 'chronicle_active',
      name: op.name,
      purpose: op.purpose,
    };
  }
  if (isNonEmptyString(op.seed)) {
    return {
      id: randomUUID(),
      kind: 'chronicle_hook',
      name: op.name,
      seed: op.seed,
    };
  }
  throw new Error('inventory_missing_shard_context');
};

const buildConsumable = (op: { name: string }): Consumable => ({
  count: 1,
  id: randomUUID(),
  name: op.name,
});

const buildSupply = (op: { name: string }): SuppliesItem => ({
  id: randomUUID(),
  name: op.name,
});

const requireName = (op: InventoryOp): string => {
  if (typeof op.name !== 'string') {
    throw new Error(`inventory_missing_name:${op.op}`);
  }
  const trimmed = op.name.trim();
  if (trimmed.length === 0) {
    throw new Error(`inventory_missing_name:${op.op}`);
  }
  return trimmed;
};

const requireBucket = (op: InventoryOp): InventoryCollectionBucket => {
  if (typeof op.bucket !== 'string' || op.bucket.trim().length === 0) {
    throw new Error(`inventory_missing_bucket:${op.op}`);
  }
  return op.bucket;
};

const requireSlot = (op: InventoryOp): Slot => {
  if (typeof op.slot !== 'string' || op.slot.trim().length === 0) {
    throw new Error(`inventory_missing_slot:${op.op}`);
  }
  return op.slot;
};

const requireAmount = (op: InventoryOp): number => {
  if (typeof op.amount !== 'number' || !Number.isFinite(op.amount) || op.amount <= 0) {
    throw new Error(`inventory_missing_amount:${op.op}`);
  }
  return op.amount;
};

const findItemIdByName = (
  inventory: Inventory,
  bucket: InventoryCollectionBucket,
  name: string
): string | null => {
  const list = readBucketEntries<{ id: string; name: string }>(inventory, bucket);
  if (list === undefined) {
    return null;
  }
  const normalized = name.trim().toLowerCase();
  for (const entry of list) {
    if (entry.name.trim().toLowerCase() === normalized) {
      return entry.id;
    }
  }
  return null;
};

const findBucketItemById = (
  inventory: Inventory,
  bucket: InventoryCollectionBucket,
  itemId: string
): unknown => {
  const list = readBucketEntries<{ id: string }>(inventory, bucket);
  if (list === undefined) {
    return null;
  }
  return list.find((entry) => entry.id === itemId) ?? null;
};

const readBucketEntries = <T extends { id: string }>(
  inventory: Inventory,
  bucket: InventoryCollectionBucket
): T[] | undefined => {
  switch (bucket) {
  case 'relics':
    return inventory.relics as T[] | undefined;
  case 'imbued_items':
    return inventory.imbued_items as T[] | undefined;
  case 'data_shards':
    return inventory.data_shards as T[] | undefined;
  case 'consumables':
    return inventory.consumables as T[] | undefined;
  case 'supplies':
    return inventory.supplies as T[] | undefined;
  default:
    return undefined;
  }
};

const matchRegistryEntry = (
  name: string,
  registry: ImbuedRegistry
): ImbuedRegistry[keyof ImbuedRegistry] | null => {
  const normalized = name.trim().toLowerCase();
  for (const entry of Object.values(registry)) {
    if (entry.name.trim().toLowerCase() === normalized) {
      return entry;
    }
  }
  return null;
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const requireNonEmpty = (value: unknown, errorCode: string): string => {
  if (!isNonEmptyString(value)) {
    throw new Error(errorCode);
  }
  return value.trim();
};
