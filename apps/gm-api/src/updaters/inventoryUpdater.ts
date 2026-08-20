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
      effect: operation.effect ?? entry.effect,
      quantity: operation.quantity,
    }
    : entry);
}

function resolveOperation(
  operation: InventoryDeltaOp,
  exists: boolean
): InventoryDeltaOp['op'] | 'skip' {
  if (!exists && operation.op === 'update') {
    log('warn', `Trying to update non-existent item ${operation.name}, adding instead.`);
    return 'add';
  }
  if (!exists && operation.op === 'remove') {
    log('warn', `Trying to remove non-existent item ${operation.name}, doing nothing.`);
    return 'skip';
  }
  if (exists && operation.op === 'add') {
    log('warn', `Trying to add existent item ${operation.name}, updating instead.`);
    return 'update';
  }
  return operation.op;
}

function createInventoryEntry(operation: InventoryDeltaOp): InventoryEntry {
  return {
    description: operation.description,
    effect: operation.effect ?? undefined,
    id: toSnakeCase(operation.name),
    kind: operation.kind,
    name: operation.name,
    quantity: operation.quantity,
  };
}

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
