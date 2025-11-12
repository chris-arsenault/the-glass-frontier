import {
  Consumable,
  DataShard,
  GearItem,
  ImbuedItem,
  ImbuedRegistry,
  Inventory,
  InventoryCollectionBucket,
  InventoryCollectionBuckets,
  PendingEquip,
  Relic,
  Slot,
  SuppliesItem,
  createEmptyInventory,
} from '@glass-frontier/dto';

type InventoryOpOptions = {
  registry?: ImbuedRegistry | null;
};

export type InventoryStoreOp =
  | { op: 'equip'; slot: Slot; itemId: string }
  | { op: 'unequip'; slot: Slot }
  | { op: 'add'; bucket: InventoryCollectionBucket; item: unknown }
  | { op: 'remove'; bucket: InventoryCollectionBucket; itemId: string }
  | { op: 'consume'; itemId: string; amount: number }
  | { op: 'spend_shard'; itemId: string };

export interface InventoryStoreDelta {
  ops: InventoryStoreOp[];
  prevRevision: number;
  nextRevision: number;
}

const bucketSchemas: Record<
  InventoryCollectionBucket,
  typeof Relic | typeof ImbuedItem | typeof DataShard | typeof Consumable | typeof SuppliesItem
> = {
  relics: Relic,
  imbued_items: ImbuedItem,
  data_shards: DataShard,
  consumables: Consumable,
  supplies: SuppliesItem,
};

export const normalizeInventory = (source?: Inventory | null): Inventory => {
  if (!source) {
    return createEmptyInventory();
  }
  return {
    revision: source.revision ?? 0,
    gear: { ...(source.gear ?? {}) },
    relics: [...(source.relics ?? [])],
    imbued_items: [...(source.imbued_items ?? [])],
    data_shards: [...(source.data_shards ?? [])],
    consumables: [...(source.consumables ?? [])],
    supplies: [...(source.supplies ?? [])],
  };
};

export const applyPendingEquipQueue = (
  inventory: Inventory,
  pending: PendingEquip[] | null | undefined,
  options?: InventoryOpOptions
): { inventory: Inventory; ops: InventoryStoreOp[] } => {
  if (!pending?.length) {
    return { inventory, ops: [] };
  }
  const next = normalizeInventory(inventory);
  const ops: InventoryStoreOp[] = [];
  for (const entry of pending) {
    if (isUnequipPending(entry)) {
      if (next.gear?.[entry.slot]) {
        const updatedGear = { ...next.gear };
        delete updatedGear[entry.slot];
        next.gear = updatedGear;
        ops.push({ op: 'unequip', slot: entry.slot });
      }
      continue;
    }
    const gearItem = buildGearItem(next, entry.slot, entry.itemId, options?.registry);
    if (!gearItem) {
      continue;
    }
    const alreadyEquipped = next.gear?.[entry.slot];
    if (alreadyEquipped && alreadyEquipped.id === gearItem.id) {
      continue;
    }
    next.gear = { ...next.gear, [entry.slot]: gearItem };
    ops.push({ op: 'equip', slot: entry.slot, itemId: entry.itemId });
  }
  return { inventory: next, ops };
};

export const applyInventoryOperations = (
  inventory: Inventory,
  ops: InventoryStoreOp[],
  options?: InventoryOpOptions
): Inventory => {
  if (!ops.length) {
    return normalizeInventory(inventory);
  }
  const working = normalizeInventory(inventory);

  for (const op of ops) {
    switch (op.op) {
      case 'equip': {
        const gearItem = buildGearItem(working, op.slot, op.itemId, options?.registry);
        if (!gearItem) {
          throw new Error(`inventory_equip_invalid_item:${op.itemId}`);
        }
        working.gear = { ...working.gear, [op.slot]: gearItem };
        break;
      }
      case 'unequip': {
        if (working.gear?.[op.slot]) {
          const updatedGear = { ...working.gear };
          delete updatedGear[op.slot];
          working.gear = updatedGear;
        }
        break;
      }
      case 'add': {
        applyBucketAdd(working, op.bucket, op.item);
        break;
      }
      case 'remove': {
        applyBucketRemove(working, op.bucket, op.itemId);
        break;
      }
      case 'consume': {
        applyConsumableUse(working, op.itemId, op.amount);
        break;
      }
      case 'spend_shard': {
        working.data_shards = working.data_shards.filter((item) => item.id !== op.itemId);
        break;
      }
      default:
        throw new Error('inventory_op_unsupported');
    }
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
  const existing = inventory.gear?.[slot];
  if (existing && existing.id === itemId) {
    return existing;
  }
    const imbued = inventory.imbued_items.find((item) => item.id === itemId);
    if (imbued) {
      const inferredSlot = imbued.slot ?? registry?.[imbued.registry_key]?.slot ?? slot;
      return {
        id: imbued.id,
        name: imbued.name,
        slot: inferredSlot,
      };
    }
  return null;
};

const applyBucketAdd = (inventory: Inventory, bucket: InventoryCollectionBucket, raw: unknown) => {
  const schema = bucketSchemas[bucket];
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`inventory_add_invalid_payload:${bucket}`);
  }
  const item = parsed.data;
  const currentList = inventory[bucket] as Array<{ id: string }>;
  const filtered = currentList.filter((entry) => entry.id !== item.id);
  (inventory as Record<string, unknown>)[bucket] = [...filtered, item];
};

const applyBucketRemove = (
  inventory: Inventory,
  bucket: InventoryCollectionBucket,
  itemId: string
) => {
  const currentList = inventory[bucket] as Array<{ id: string }>;
  (inventory as Record<string, unknown>)[bucket] = currentList.filter(
    (entry) => entry.id !== itemId
  );
};

const applyConsumableUse = (inventory: Inventory, itemId: string, amount: number) => {
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
