import type { Inventory, InventoryDeltaOp, InventoryEntry } from '@glass-frontier/dto';
import type { GraphContext } from '@glass-frontier/gm-api/types';
import { log, toSnakeCase } from '@glass-frontier/utils';

export function createUpdatedInventory(context: GraphContext): Inventory {
  let inventory = structuredClone(context.chronicleState.character.inventory);
  for (const operation of context.inventoryDelta?.ops ?? []) {
    inventory = applyOperation(inventory, operation);
  }
  return inventory;
}

function applyOperation(inventory: Inventory, operation: InventoryDeltaOp): Inventory {
  const index = itemIndex(inventory, operation);
  const resolvedOperation = resolveOperation(operation, index !== -1);
  if (resolvedOperation === 'skip') {
    return inventory;
  }
  if (resolvedOperation === 'add') {
    log('info', `Adding item ${operation.name}`);
    return [...inventory, createInventoryEntry(operation)];
  }
  if (resolvedOperation === 'remove') {
    log('info', `Removing item ${operation.name}`);
    return inventory.filter((_, entryIndex) => entryIndex !== index);
  }
  log('info', `Updating item ${operation.name}`);
  return inventory.map((entry, entryIndex) => entryIndex === index
    ? {
      ...entry,
      description: operation.description,
      effect: operation.effect === undefined
        ? entry.effect
        : normalizeEffect(operation.effect),
      quantity: operation.quantity,
    }
    : entry);
}

function resolveOperation(
  operation: InventoryDeltaOp,
  exists: boolean
): InventoryDeltaOp['op'] | 'skip' {
  if (operation.op === 'add') {
    return resolveAdd(operation, exists);
  }
  if (operation.op === 'update') {
    return resolveUpdate(operation, exists);
  }
  return resolveRemove(operation, exists);
}

const resolveAdd = (
  operation: InventoryDeltaOp,
  exists: boolean
): InventoryDeltaOp['op'] | 'skip' => {
  if (operation.quantity === 0) {
    log('warn', `Trying to add zero ${operation.name}, doing nothing.`);
    return 'skip';
  }
  if (exists) {
    log('warn', `Trying to add existent item ${operation.name}, updating instead.`);
    return 'update';
  }
  return 'add';
};

const resolveUpdate = (
  operation: InventoryDeltaOp,
  exists: boolean
): InventoryDeltaOp['op'] | 'skip' => {
  if (!exists) {
    log('warn', `Trying to update non-existent item ${operation.name}, doing nothing.`);
    return 'skip';
  }
  if (operation.quantity === 0) {
    return 'remove';
  }
  return 'update';
};

const resolveRemove = (
  operation: InventoryDeltaOp,
  exists: boolean
): InventoryDeltaOp['op'] | 'skip' => {
  if (!exists) {
    log('warn', `Trying to remove non-existent item ${operation.name}, doing nothing.`);
    return 'skip';
  }
  return 'remove';
};

function createInventoryEntry(operation: InventoryDeltaOp): InventoryEntry {
  return {
    description: operation.description,
    effect: normalizeEffect(operation.effect),
    id: toSnakeCase(operation.name),
    kind: operation.kind,
    name: operation.name,
    quantity: operation.quantity,
  };
}

const normalizeEffect = (effect: string | null | undefined): string | undefined => {
  if (effect === null || effect === undefined) {
    return undefined;
  }
  const normalized = effect.trim();
  return /^(?:null|none)$/iu.test(normalized) || normalized.length === 0
    ? undefined
    : normalized;
};

function itemIndex(inventory: Inventory, item: InventoryDeltaOp): number {
  const id = toSnakeCase(item.name);
  log('info', `Processing item ${id}`);
  return inventory.findIndex((entry) => {
    if (entry.id !== id) {
      return false;
    }

    if (entry.kind !== item.kind) {
      log('warn', 'Item trying to change kind, dropping kind change.');
    }

    return true;
  });
}
