import { randomUUID } from 'node:crypto';
import type { GraphContext } from '../../types.js';
import type { GraphNode } from '../orchestrator.js';
import type { ImbuedRegistryStore } from '@glass-frontier/persistence';
import {
  applyPendingEquipQueue,
  applyInventoryOperations,
  normalizeInventory,
  type InventoryStoreDelta,
  type InventoryStoreOp,
} from '@glass-frontier/persistence';
import {
  InventoryDelta,
  ImbuedRegistry,
  Inventory,
  InventoryCollectionBucket,
  Slot,
  Relic,
  ImbuedItem,
  DataShard,
  Consumable,
  SuppliesItem,
} from '@glass-frontier/dto';
import { composeInventoryDeltaPrompt } from '../prompts/prompts';

class InventoryDeltaNode implements GraphNode {
  readonly id = 'inventory-delta';

  constructor(private readonly registryStore: ImbuedRegistryStore) {}

  async execute(context: GraphContext): Promise<GraphContext> {
    if (context.failure || !context.chronicle.character) {
      return context;
    }

    let registry: ImbuedRegistry;
    try {
      registry = await this.#materializeRegistry();
    } catch (error) {
      context.telemetry?.recordToolError({
        chronicleId: context.chronicleId,
        operation: 'inventory-registry.load',
        attempt: 0,
        message: error instanceof Error ? error.message : 'unknown',
      });
      return { ...context, failure: true };
    }
    const baseline = normalizeInventory(context.chronicle.character.inventory);
    const pendingEquip = context.pendingEquip ?? [];
    const { inventory: equipApplied, ops: equipOps } = applyPendingEquipQueue(
      baseline,
      pendingEquip,
      { registry }
    );
    let workingInventory = equipApplied;
    let storeOps: InventoryStoreOp[] = [...equipOps];
    let displayOps = this.#describeStoreOps(equipOps, baseline, registry);
    const shouldInvokeLlm =
      Boolean(context.gmMessage?.content?.trim()) &&
      Boolean(context.playerIntent?.intentSummary?.trim());

    if (shouldInvokeLlm) {
      const prompt = await composeInventoryDeltaPrompt({
        templates: context.templates,
        inventory: equipApplied,
        gmMessage: context.gmMessage?.content ?? '',
        gmSummary: context.gmSummary ?? '',
        intent: context.playerIntent!,
        pendingEquip,
        registry,
      });

      try {
        const result = await context.llm.generateJson({
          prompt,
          temperature: 0.1,
          maxTokens: 400,
          metadata: { nodeId: this.id, chronicleId: context.chronicleId },
        });
        const parsed = InventoryDelta.safeParse(result.json);
        if (!parsed.success) {
          context.telemetry?.recordToolError({
            chronicleId: context.chronicleId,
            operation: 'llm.inventory-delta.parse',
            attempt: 0,
            message: 'inventory_delta_parse_failed',
          });
          return { ...context, failure: true };
        }
        if (parsed.data.prevRevision !== baseline.revision) {
          context.telemetry?.recordToolError({
            chronicleId: context.chronicleId,
            operation: 'llm.inventory-delta.conflict',
            attempt: 0,
            message: `prevRevision mismatch expected=${baseline.revision} got=${parsed.data.prevRevision}`,
          });
          return { ...context, failure: true };
        }
        if (parsed.data.nextRevision < parsed.data.prevRevision) {
          context.telemetry?.recordToolError({
            chronicleId: context.chronicleId,
            operation: 'llm.inventory-delta.revision',
            attempt: 0,
            message: `nextRevision regression prev=${parsed.data.prevRevision} next=${parsed.data.nextRevision}`,
          });
          return { ...context, failure: true };
        }
        try {
          const conversion = this.#convertFlatDelta(parsed.data, workingInventory, registry);
          storeOps = storeOps.concat(conversion.storeOps);
          displayOps = displayOps.concat(conversion.displayOps);
          workingInventory = conversion.inventory;
        } catch (error) {
          context.telemetry?.recordToolError({
            chronicleId: context.chronicleId,
            operation: 'inventory-delta.transform',
            attempt: 0,
            message: error instanceof Error ? error.message : 'unknown',
          });
          return { ...context, failure: true };
        }
      } catch (error) {
        context.telemetry?.recordToolError({
          chronicleId: context.chronicleId,
          operation: 'llm.inventory-delta.invoke',
          attempt: 0,
          message: error instanceof Error ? error.message : 'unknown',
        });
        return { ...context, failure: true };
      }
    }

    const hasChanges = storeOps.length > 0;
    const nextRevision = hasChanges ? baseline.revision + 1 : baseline.revision;
    const displayDelta: InventoryDelta = {
      ops: displayOps,
      prevRevision: baseline.revision,
      nextRevision,
    };
    const storeDelta: InventoryStoreDelta = {
      ops: storeOps,
      prevRevision: baseline.revision,
      nextRevision,
    };

    return {
      ...context,
      inventoryDelta: displayDelta,
      inventoryStoreDelta: storeDelta,
      inventoryPreview: workingInventory,
      inventoryRegistry: registry,
    };
  }

  async #materializeRegistry(): Promise<ImbuedRegistry> {
    const entries = await this.registryStore.listEntries();
    return entries.reduce<ImbuedRegistry>((acc, entry) => {
      acc[entry.key] = entry;
      return acc;
    }, {});
  }

  #describeStoreOps(
    ops: InventoryStoreOp[],
    startingInventory: Inventory,
    registry: ImbuedRegistry
  ): InventoryDelta['ops'] {
    if (!ops.length) {
      return [];
    }
    let preview = normalizeInventory(startingInventory);
    const descriptions: InventoryDelta['ops'] = [];
    for (const op of ops) {
      const next = applyInventoryOperations(preview, [op], { registry });
      const description = this.#describeStoreOp(op, preview, next);
      if (description) {
        descriptions.push(description);
      }
      preview = next;
    }
    return descriptions;
  }

  #convertFlatDelta(
    delta: InventoryDelta,
    startingInventory: Inventory,
    registry: ImbuedRegistry
  ): { storeOps: InventoryStoreOp[]; displayOps: InventoryDelta['ops']; inventory: Inventory } {
    const storeOps: InventoryStoreOp[] = [];
    const displayOps: InventoryDelta['ops'] = [];
    let preview = normalizeInventory(startingInventory);

    for (const op of delta.ops ?? []) {
      const storeOp = this.#convertFlatOp(op, preview, registry);
      const next = applyInventoryOperations(preview, [storeOp], { registry });
      const description = this.#describeStoreOp(storeOp, preview, next);
      if (description) {
        displayOps.push(description);
      }
      storeOps.push(storeOp);
      preview = next;
    }

    return { storeOps, displayOps, inventory: preview };
  }

  #convertFlatOp(
    op: InventoryDelta['ops'][number],
    inventory: Inventory,
    registry: ImbuedRegistry
  ): InventoryStoreOp {
    switch (op.op) {
      case 'equip': {
        const slot = this.#requireSlot(op);
        const name = this.#requireName(op);
        const itemId = this.#findItemIdByName(inventory, 'imbued_items', name);
        if (!itemId) {
          throw new Error(`inventory_unknown_item:${name}`);
        }
        return { op: 'equip', slot, itemId };
      }
      case 'unequip': {
        const slot = this.#requireSlot(op);
        return { op: 'unequip', slot };
      }
      case 'add': {
        const bucket = this.#requireBucket(op);
        const name = this.#requireName(op);
        const item = this.#buildItemForBucket(bucket, { ...op, name }, registry);
        return { op: 'add', bucket, item };
      }
      case 'remove': {
        const bucket = this.#requireBucket(op);
        const name = this.#requireName(op);
        const itemId = this.#findItemIdByName(inventory, bucket, name);
        if (!itemId) {
          throw new Error(`inventory_unknown_item:${name}`);
        }
        return { op: 'remove', bucket, itemId };
      }
      case 'consume': {
        const amount = this.#requireAmount(op);
        const name = this.#requireName(op);
        const itemId = this.#findItemIdByName(inventory, 'consumables', name);
        if (!itemId) {
          throw new Error(`inventory_unknown_consumable:${name}`);
        }
        return { op: 'consume', itemId, amount };
      }
      case 'spend_shard': {
        const name = this.#requireName(op);
        const itemId = this.#findItemIdByName(inventory, 'data_shards', name);
        if (!itemId) {
          throw new Error(`inventory_unknown_shard:${name}`);
        }
        return { op: 'spend_shard', itemId };
      }
      default:
        throw new Error(`inventory_op_not_supported:${op.op}`);
    }
  }

  #describeStoreOp(
    op: InventoryStoreOp,
    before: Inventory,
    after: Inventory
  ): InventoryDelta['ops'][number] | null {
    switch (op.op) {
      case 'equip':
        return {
          op: 'equip',
          slot: op.slot,
          name: after.gear?.[op.slot]?.name,
        };
      case 'unequip':
        return {
          op: 'unequip',
          slot: op.slot,
          name: before.gear?.[op.slot]?.name,
        };
      case 'add':
        return this.#describeBucketItem('add', op.bucket, op.item);
      case 'remove': {
        const removed = this.#findBucketItemById(before, op.bucket, op.itemId);
        return this.#describeBucketItem('remove', op.bucket, removed);
      }
      case 'consume': {
        const item = this.#findBucketItemById(before, 'consumables', op.itemId) as
          | Consumable
          | undefined;
        return {
          op: 'consume',
          bucket: 'consumables',
          name: item?.name,
          amount: op.amount,
        };
      }
      case 'spend_shard': {
        const shard = this.#findBucketItemById(before, 'data_shards', op.itemId) as
          | DataShard
          | undefined;
        return shard
          ? {
              op: 'spend_shard',
              bucket: 'data_shards',
              name: shard.name,
              purpose: shard.kind === 'chronicle_active' ? shard.purpose : undefined,
              seed: shard.kind === 'chronicle_hook' ? shard.seed : undefined,
            }
          : null;
      }
      default:
        return null;
    }
  }

  #describeBucketItem(
    op: 'add' | 'remove',
    bucket: InventoryCollectionBucket,
    item: unknown
  ): InventoryDelta['ops'][number] | null {
    if (!item) {
      return null;
    }
    switch (bucket) {
      case 'relics': {
        const relic = item as Relic;
        return { op, bucket, name: relic.name, hook: relic.hook };
      }
      case 'imbued_items': {
        const imbued = item as ImbuedItem;
        return { op, bucket, name: imbued.name, slot: imbued.slot };
      }
      case 'data_shards': {
        const shard = item as DataShard;
        return {
          op,
          bucket,
          name: shard.name,
          purpose: shard.kind === 'chronicle_active' ? shard.purpose : undefined,
          seed: shard.kind === 'chronicle_hook' ? shard.seed : undefined,
        };
      }
      case 'consumables': {
        const consumable = item as Consumable;
        return { op, bucket, name: consumable.name };
      }
      case 'supplies': {
        const supply = item as SuppliesItem;
        return { op, bucket, name: supply.name };
      }
      default:
        return null;
    }
  }

  #buildItemForBucket(
    bucket: InventoryCollectionBucket,
    op: { name: string; hook?: string; purpose?: string; seed?: string; slot?: Slot | null },
    registry: ImbuedRegistry
  ): unknown {
    switch (bucket) {
      case 'relics': {
        if (!op.hook) {
          throw new Error('inventory_missing_hook');
        }
        const relic: Relic = {
          id: randomUUID(),
          name: op.name,
          hook: op.hook,
        };
        return relic;
      }
      case 'imbued_items': {
        const entry = this.#matchRegistryEntry(op.name, registry);
        if (!entry) {
          throw new Error(`inventory_unknown_imbued:${op.name}`);
        }
        const item: ImbuedItem = {
          id: randomUUID(),
          name: entry.name,
          registry_key: entry.key,
          slot: entry.slot,
        };
        return item;
      }
      case 'data_shards': {
        if (op.purpose) {
          const shard: DataShard = {
            kind: 'chronicle_active',
            id: randomUUID(),
            name: op.name,
            purpose: op.purpose,
          };
          return shard;
        }
        if (op.seed) {
          const shard: DataShard = {
            kind: 'chronicle_hook',
            id: randomUUID(),
            name: op.name,
            seed: op.seed,
          };
          return shard;
        }
        throw new Error('inventory_missing_shard_context');
      }
      case 'consumables': {
        const consumable: Consumable = {
          id: randomUUID(),
          name: op.name,
          count: 1,
        };
        return consumable;
      }
      case 'supplies': {
        const supply: SuppliesItem = {
          id: randomUUID(),
          name: op.name,
        };
        return supply;
      }
      default:
        throw new Error(`inventory_unknown_bucket:${bucket}`);
    }
  }

  #requireName(op: InventoryDelta['ops'][number]): string {
    if (!op.name) {
      throw new Error(`inventory_missing_name:${op.op}`);
    }
    return op.name.trim();
  }

  #requireBucket(op: InventoryDelta['ops'][number]): InventoryCollectionBucket {
    if (!op.bucket) {
      throw new Error(`inventory_missing_bucket:${op.op}`);
    }
    return op.bucket;
  }

  #requireSlot(op: InventoryDelta['ops'][number]): Slot {
    if (!op.slot) {
      throw new Error(`inventory_missing_slot:${op.op}`);
    }
    return op.slot;
  }

  #requireAmount(op: InventoryDelta['ops'][number]): number {
    if (!op.amount || op.amount <= 0) {
      throw new Error(`inventory_missing_amount:${op.op}`);
    }
    return op.amount;
  }

  #findItemIdByName(
    inventory: Inventory,
    bucket: InventoryCollectionBucket,
    name: string
  ): string | null {
    const normalized = name.trim().toLowerCase();
    const list = inventory[bucket] as Array<{ id: string; name: string }> | undefined;
    if (!list) {
      return null;
    }
    for (const entry of list) {
      if (entry.name.trim().toLowerCase() === normalized) {
        return entry.id;
      }
    }
    return null;
  }

  #findBucketItemById(
    inventory: Inventory,
    bucket: InventoryCollectionBucket,
    itemId: string
  ): unknown {
    const list = inventory[bucket] as Array<{ id: string }> | undefined;
    if (!list) {
      return null;
    }
    return list.find((entry) => entry.id === itemId) ?? null;
  }

  #matchRegistryEntry(name: string, registry: ImbuedRegistry): ImbuedRegistry[keyof ImbuedRegistry] | null {
    const normalized = name.trim().toLowerCase();
    for (const entry of Object.values(registry)) {
      if (entry.name.trim().toLowerCase() === normalized) {
        return entry;
      }
    }
    return null;
  }
}

export { InventoryDeltaNode };
