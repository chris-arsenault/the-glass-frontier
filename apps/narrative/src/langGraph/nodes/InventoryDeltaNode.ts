import type {
  ImbuedRegistry,
  Inventory,
  InventoryCollectionBucket,
  Slot,
  Relic,
  ImbuedItem,
  DataShard,
  Consumable,
  SuppliesItem } from '@glass-frontier/dto';
import {
  InventoryDelta
} from '@glass-frontier/dto';
import type { ImbuedRegistryStore } from '@glass-frontier/persistence';
import {
  applyPendingEquipQueue,
  applyInventoryOperations,
  normalizeInventory,
  type InventoryStoreDelta,
  type InventoryStoreOp,
} from '@glass-frontier/persistence';
import { randomUUID } from 'node:crypto';

import type { GraphContext } from '../../types.js';
import type { GraphNode } from '../orchestrator.js';
import { composeInventoryDeltaPrompt } from '../prompts/prompts';

class InventoryDeltaNode implements GraphNode {
  readonly id = 'inventory-delta';

  constructor(private readonly registryStore: ImbuedRegistryStore) {}

  async execute(context: GraphContext): Promise<GraphContext> {
    if (context.failure || !context.chronicle.character) {
      return context;
    }

    const registry = await this.#loadRegistry(context);
    if (!registry) {
      return { ...context, failure: true };
    }

    const baseline = normalizeInventory(context.chronicle.character.inventory);
    const pendingEquip = context.pendingEquip ?? [];
    const pendingResult = this.#applyPendingEquip(baseline, pendingEquip, registry);

    let workingInventory = pendingResult.inventory;
    let storeOps: InventoryStoreOp[] = [...pendingResult.storeOps];
    let displayOps: InventoryDelta['ops'] = [...pendingResult.displayOps];

    if (this.#shouldInvokeLlm(context)) {
      const llmResult = await this.#applyLlmDelta({
        baseline,
        context,
        inventory: workingInventory,
        pendingEquip,
        registry,
      });
      if (!llmResult) {
        return { ...context, failure: true };
      }
      workingInventory = llmResult.inventory;
      storeOps = storeOps.concat(llmResult.storeOps);
      displayOps = displayOps.concat(llmResult.displayOps);
    }

    return this.#buildResponse(context, baseline, workingInventory, registry, storeOps, displayOps);
  }

  async #materializeRegistry(): Promise<ImbuedRegistry> {
    const entries = await this.registryStore.listEntries();
    return entries.reduce<ImbuedRegistry>((acc, entry) => {
      acc[entry.key] = entry;
      return acc;
    }, {});
  }

  async #loadRegistry(context: GraphContext): Promise<ImbuedRegistry | null> {
    try {
      return await this.#materializeRegistry();
    } catch (error) {
      context.telemetry?.recordToolError({
        attempt: 0,
        chronicleId: context.chronicleId,
        message: error instanceof Error ? error.message : 'unknown',
        operation: 'inventory-registry.load',
      });
      return null;
    }
  }

  #applyPendingEquip(
    baseline: Inventory,
    pendingEquip: GraphContext['pendingEquip'],
    registry: ImbuedRegistry
  ): { inventory: Inventory; storeOps: InventoryStoreOp[]; displayOps: InventoryDelta['ops'] } {
    const { inventory, ops } = applyPendingEquipQueue(baseline, pendingEquip, { registry });
    return {
      displayOps: this.#describeStoreOps(ops, baseline, registry),
      inventory,
      storeOps: ops,
    };
  }

  #shouldInvokeLlm(context: GraphContext): boolean {
    return Boolean(context.gmMessage?.content?.trim() && context.playerIntent?.intentSummary?.trim());
  }

  async #applyLlmDelta({
    baseline,
    context,
    inventory,
    pendingEquip,
    registry,
  }: {
    baseline: Inventory;
    context: GraphContext;
    inventory: Inventory;
    pendingEquip: GraphContext['pendingEquip'];
    registry: ImbuedRegistry;
  }): Promise<{ inventory: Inventory; storeOps: InventoryStoreOp[]; displayOps: InventoryDelta['ops'] } | null> {
    try {
      const prompt = await composeInventoryDeltaPrompt({
        gmMessage: context.gmMessage?.content ?? '',
        gmSummary: context.gmSummary ?? '',
        intent: context.playerIntent!,
        inventory,
        pendingEquip,
        registry,
        templates: context.templates,
      });
      const result = await context.llm.generateJson({
        maxTokens: 400,
        metadata: { chronicleId: context.chronicleId, nodeId: this.id },
        prompt,
        temperature: 0.1,
      });
      const parsed = InventoryDelta.safeParse(result.json);
      if (!parsed.success) {
        context.telemetry?.recordToolError({
          attempt: 0,
          chronicleId: context.chronicleId,
          message: 'inventory_delta_parse_failed',
          operation: 'llm.inventory-delta.parse',
        });
        return null;
      }
      if (!this.#validateDeltaMetadata(parsed.data, baseline, context)) {
        return null;
      }
      return this.#convertFlatDelta(parsed.data, inventory, registry);
    } catch (error) {
      context.telemetry?.recordToolError({
        attempt: 0,
        chronicleId: context.chronicleId,
        message: error instanceof Error ? error.message : 'unknown',
        operation: 'llm.inventory-delta.invoke',
      });
      return null;
    }
  }

  #validateDeltaMetadata(delta: InventoryDelta, baseline: Inventory, context: GraphContext): boolean {
    if (delta.prevRevision !== baseline.revision) {
      context.telemetry?.recordToolError({
        attempt: 0,
        chronicleId: context.chronicleId,
        message: `prevRevision mismatch expected=${baseline.revision} got=${delta.prevRevision}`,
        operation: 'llm.inventory-delta.conflict',
      });
      return false;
    }
    if (delta.nextRevision < delta.prevRevision) {
      context.telemetry?.recordToolError({
        attempt: 0,
        chronicleId: context.chronicleId,
        message: `nextRevision regression prev=${delta.prevRevision} next=${delta.nextRevision}`,
        operation: 'llm.inventory-delta.revision',
      });
      return false;
    }
    return true;
  }

  #buildResponse(
    context: GraphContext,
    baseline: Inventory,
    workingInventory: Inventory,
    registry: ImbuedRegistry,
    storeOps: InventoryStoreOp[],
    displayOps: InventoryDelta['ops']
  ): GraphContext {
    const hasChanges = storeOps.length > 0;
    const nextRevision = hasChanges ? baseline.revision + 1 : baseline.revision;
    const displayDelta: InventoryDelta = {
      nextRevision,
      ops: displayOps,
      prevRevision: baseline.revision,
    };
    const storeDelta: InventoryStoreDelta = {
      nextRevision,
      ops: storeOps,
      prevRevision: baseline.revision,
    };

    return {
      ...context,
      inventoryDelta: displayDelta,
      inventoryPreview: workingInventory,
      inventoryRegistry: registry,
      inventoryStoreDelta: storeDelta,
    };
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

    return { displayOps, inventory: preview, storeOps };
  }

  #convertFlatOp(
    op: InventoryDelta['ops'][number],
    inventory: Inventory,
    registry: ImbuedRegistry
  ): InventoryStoreOp {
    switch (op.op) {
    case 'equip':
      return this.#convertEquipOp(op, inventory);
    case 'unequip':
      return this.#convertUnequipOp(op);
    case 'add':
      return this.#convertAddOp(op, registry);
    case 'remove':
      return this.#convertRemoveOp(op, inventory);
    case 'consume':
      return this.#convertConsumeOp(op, inventory);
    case 'spend_shard':
      return this.#convertSpendShardOp(op, inventory);
    default:
      throw new Error(`inventory_op_not_supported:${op.op}`);
    }
  }

  #convertEquipOp(op: InventoryDelta['ops'][number], inventory: Inventory): InventoryStoreOp {
    const slot = this.#requireSlot(op);
    const name = this.#requireName(op);
    const itemId = this.#findItemIdByName(inventory, 'imbued_items', name);
    if (!itemId) {
      throw new Error(`inventory_unknown_item:${name}`);
    }
    return { itemId, op: 'equip', slot };
  }

  #convertUnequipOp(op: InventoryDelta['ops'][number]): InventoryStoreOp {
    const slot = this.#requireSlot(op);
    return { op: 'unequip', slot };
  }

  #convertAddOp(
    op: InventoryDelta['ops'][number],
    registry: ImbuedRegistry
  ): InventoryStoreOp {
    const bucket = this.#requireBucket(op);
    const name = this.#requireName(op);
    const item = this.#buildItemForBucket(bucket, { ...op, name }, registry);
    return { bucket, item, op: 'add' };
  }

  #convertRemoveOp(
    op: InventoryDelta['ops'][number],
    inventory: Inventory
  ): InventoryStoreOp {
    const bucket = this.#requireBucket(op);
    const name = this.#requireName(op);
    const itemId = this.#findItemIdByName(inventory, bucket, name);
    if (!itemId) {
      throw new Error(`inventory_unknown_item:${name}`);
    }
    return { bucket, itemId, op: 'remove' };
  }

  #convertConsumeOp(
    op: InventoryDelta['ops'][number],
    inventory: Inventory
  ): InventoryStoreOp {
    const amount = this.#requireAmount(op);
    const name = this.#requireName(op);
    const itemId = this.#findItemIdByName(inventory, 'consumables', name);
    if (!itemId) {
      throw new Error(`inventory_unknown_consumable:${name}`);
    }
    return { amount, itemId, op: 'consume' };
  }

  #convertSpendShardOp(
    op: InventoryDelta['ops'][number],
    inventory: Inventory
  ): InventoryStoreOp {
    const name = this.#requireName(op);
    const itemId = this.#findItemIdByName(inventory, 'data_shards', name);
    if (!itemId) {
      throw new Error(`inventory_unknown_shard:${name}`);
    }
    return { itemId, op: 'spend_shard' };
  }

  #describeStoreOp(
    op: InventoryStoreOp,
    before: Inventory,
    after: Inventory
  ): InventoryDelta['ops'][number] | null {
    switch (op.op) {
    case 'equip':
      return this.#describeEquipOp(op, after);
    case 'unequip':
      return this.#describeUnequipOp(op, before);
    case 'add':
      return this.#describeBucketItem('add', op.bucket, op.item);
    case 'remove':
      return this.#describeBucketItem(
        'remove',
        op.bucket,
        this.#findBucketItemById(before, op.bucket, op.itemId)
      );
    case 'consume':
      return this.#describeConsumeOp(op, before);
    case 'spend_shard':
      return this.#describeSpendShardOp(op, before);
    default:
      return null;
    }
  }

  #describeEquipOp(
    op: Extract<InventoryStoreOp, { op: 'equip' }>,
    after: Inventory
  ): InventoryDelta['ops'][number] {
    return {
      name: after.gear?.[op.slot]?.name,
      op: 'equip',
      slot: op.slot,
    };
  }

  #describeUnequipOp(
    op: Extract<InventoryStoreOp, { op: 'unequip' }>,
    before: Inventory
  ): InventoryDelta['ops'][number] {
    return {
      name: before.gear?.[op.slot]?.name,
      op: 'unequip',
      slot: op.slot,
    };
  }

  #describeConsumeOp(
    op: Extract<InventoryStoreOp, { op: 'consume' }>,
    before: Inventory
  ): InventoryDelta['ops'][number] {
    const item = this.#findBucketItemById(before, 'consumables', op.itemId) as
        | Consumable
        | undefined;
    return {
      amount: op.amount,
      bucket: 'consumables',
      name: item?.name,
      op: 'consume',
    };
  }

  #describeSpendShardOp(
    op: Extract<InventoryStoreOp, { op: 'spend_shard' }>,
    before: Inventory
  ): InventoryDelta['ops'][number] | null {
    const shard = this.#findBucketItemById(before, 'data_shards', op.itemId) as DataShard | undefined;
    if (!shard) {
      return null;
    }
    return {
      bucket: 'data_shards',
      name: shard.name,
      op: 'spend_shard',
      purpose: shard.kind === 'chronicle_active' ? shard.purpose : undefined,
      seed: shard.kind === 'chronicle_hook' ? shard.seed : undefined,
    };
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
      return { bucket, hook: relic.hook, name: relic.name, op };
    }
    case 'imbued_items': {
      const imbued = item as ImbuedItem;
      return { bucket, name: imbued.name, op, slot: imbued.slot };
    }
    case 'data_shards': {
      const shard = item as DataShard;
      return {
        bucket,
        name: shard.name,
        op,
        purpose: shard.kind === 'chronicle_active' ? shard.purpose : undefined,
        seed: shard.kind === 'chronicle_hook' ? shard.seed : undefined,
      };
    }
    case 'consumables': {
      const consumable = item as Consumable;
      return { bucket, name: consumable.name, op };
    }
    case 'supplies': {
      const supply = item as SuppliesItem;
      return { bucket, name: supply.name, op };
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
        hook: op.hook,
        id: randomUUID(),
        name: op.name,
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
          id: randomUUID(),
          kind: 'chronicle_active',
          name: op.name,
          purpose: op.purpose,
        };
        return shard;
      }
      if (op.seed) {
        const shard: DataShard = {
          id: randomUUID(),
          kind: 'chronicle_hook',
          name: op.name,
          seed: op.seed,
        };
        return shard;
      }
      throw new Error('inventory_missing_shard_context');
    }
    case 'consumables': {
      const consumable: Consumable = {
        count: 1,
        id: randomUUID(),
        name: op.name,
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
