import type {
  Inventory,
  InventoryDelta,
  InventoryEntry,
  InventoryEntryKind,
} from '@glass-frontier/worldstate/dto';
import { randomUUID } from 'node:crypto';

type InventoryOp = InventoryDelta['ops'][number];

export type InventoryDeltaApplication = {
  inventory: Inventory;
  ops: InventoryDelta['ops'];
};

export const applyInventoryDelta = (
  baseline: Inventory,
  delta: InventoryDelta | null | undefined
): InventoryDeltaApplication => {
  const working = cloneInventory(baseline);
  const applied: InventoryDelta['ops'] = [];
  const operations = Array.isArray(delta?.ops) ? delta!.ops : [];

  for (const rawOp of operations) {
    const handler = inventoryHandlers[rawOp.op];
    if (handler === undefined) {
      throw new Error(`inventory_op_not_supported:${String(rawOp.op)}`);
    }
    const result = handler(working, rawOp);
    if (result !== null) {
      applied.push(result);
    }
  }

  return {
    inventory: working,
    ops: applied,
  };
};

type InventoryHandler = (inventory: Inventory, op: InventoryOp) => InventoryOp | null;


const applyAddOp: InventoryHandler = (inventory, op) => {
  const name = requireName(op.name);
  const kind = requireKind(op.kind);
  const description = requireDescription(op.description);
  const effect = sanitizeOptionalString(op.effect);
  const quantity = op.quantity !== undefined ? requireQuantity(op.quantity) : 1;

  if (findEntryIndex(inventory, name, kind) !== -1) {
    throw new Error(`inventory_duplicate_entry:${name}`);
  }

  const entry: InventoryEntry = {
    id: randomUUID(),
    name,
    kind,
    description,
    effect: effect ?? undefined,
    quantity,
    tags: [],
    metadata: {},
  };

  inventory.push(entry);

  return {
    op: 'add',
    name: entry.name,
    kind: entry.kind,
    description: entry.description,
    effect: entry.effect,
    quantity: entry.quantity,
  } satisfies InventoryOp;
};

const applyRemoveOp: InventoryHandler = (inventory, op) => {
  const name = requireName(op.name);
  const kind = op.kind;
  const index = findEntryIndex(inventory, name, kind);
  if (index === -1) {
    throw new Error(`inventory_unknown_entry:${name}`);
  }
  const [removed] = inventory.splice(index, 1);
  return {
    op: 'remove',
    name: removed.name,
    kind: removed.kind,
  } satisfies InventoryOp;
};

const applyUpdateOp: InventoryHandler = (inventory, op) => {
  const name = requireName(op.name);
  const kind = op.kind;
  const index = findEntryIndex(inventory, name, kind);
  if (index === -1) {
    throw new Error(`inventory_unknown_entry:${name}`);
  }
  const entry = inventory[index];
  let changed = false;
  const response: InventoryOp = { op: 'update', name: entry.name };

  if (typeof op.description === 'string') {
    entry.description = requireDescription(op.description);
    response.description = entry.description;
    changed = true;
  }
  if (typeof op.effect === 'string') {
    entry.effect = sanitizeOptionalString(op.effect) ?? undefined;
    response.effect = entry.effect;
    changed = true;
  }
  if (typeof op.quantity === 'number' && Number.isFinite(op.quantity)) {
    entry.quantity = requireQuantity(op.quantity);
    response.quantity = entry.quantity;
    changed = true;
  }

  return changed ? response : null;
};

const applyConsumeOp: InventoryHandler = (inventory, op) => {
  const name = requireName(op.name);
  const kind = op.kind;
  const index = findEntryIndex(inventory, name, kind);
  if (index === -1) {
    throw new Error(`inventory_unknown_entry:${name}`);
  }
  const entry = inventory[index];
  const amount = 1;
  if (entry.quantity < amount) {
    throw new Error('inventory_consume_insufficient_quantity');
  }
  entry.quantity -= amount;
  const result: InventoryOp = {
    op: 'consume',
    name: entry.name,
    kind: entry.kind,
    quantity: entry.quantity,
  };
  if (entry.quantity === 0) {
    inventory.splice(index, 1);
  }
  return result;
};

const inventoryHandlers: Record<InventoryOp['op'], InventoryHandler> = {
  add: applyAddOp,
  remove: applyRemoveOp,
  update: applyUpdateOp,
  consume: applyConsumeOp,
};

const cloneInventory = (inventory: Inventory): Inventory =>
  Array.isArray(inventory)
    ? inventory.map((entry) => ({
      ...entry,
      tags: [...entry.tags],
      metadata: cloneMetadata(entry.metadata),
    }))
    : [];

const cloneMetadata = (metadata: InventoryEntry['metadata']): InventoryEntry['metadata'] =>
  metadata ? { ...metadata } : undefined;

const sanitizeOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const sanitizeTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const normalized = value
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
  return Array.from(new Set(normalized));
};

const findEntryIndex = (
  inventory: Inventory,
  name: string,
  kind?: InventoryEntryKind | null
): number => {
  const normalized = name.trim().toLowerCase();
  return inventory.findIndex((entry) => {
    if (entry.name.trim().toLowerCase() !== normalized) {
      return false;
    }
    if (kind === undefined || kind === null) {
      return true;
    }
    return entry.kind === kind;
  });
};

const requireName = (value: unknown): string => {
  if (typeof value !== 'string') {
    throw new Error('inventory_missing_name');
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error('inventory_missing_name');
  }
  return trimmed;
};

const requireKind = (value: unknown): InventoryEntryKind => {
  if (typeof value !== 'string') {
    throw new Error('inventory_missing_kind');
  }
  const normalized = value.trim();
  if (!isInventoryKind(normalized)) {
    throw new Error(`inventory_unknown_kind:${value}`);
  }
  return normalized;
};

const requireDescription = (value: unknown): string => {
  if (typeof value !== 'string') {
    throw new Error('inventory_missing_description');
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error('inventory_missing_description');
  }
  return trimmed;
};

const requireQuantity = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error('inventory_invalid_quantity');
  }
  return value;
};

const isInventoryKind = (value: string): value is InventoryEntryKind =>
  value === 'relic' || value === 'consumable' || value === 'supplies' || value === 'gear';
