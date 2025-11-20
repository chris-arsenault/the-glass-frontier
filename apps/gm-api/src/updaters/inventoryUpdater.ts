import {GraphContext} from "@glass-frontier/gm-api/types";
import {Inventory, InventoryDeltaOp, InventoryEntry, InventoryEntryKind} from "@glass-frontier/dto";
import {log, toSnakeCase} from "@glass-frontier/utils";
import {effect} from "zod/v3";

export function createUpdatedInventory(context: GraphContext): Inventory {
  const working = structuredClone(context.chronicleState.character?.inventory || []);

  context.inventoryDelta?.ops.forEach(op => {
    const existingIndex = itemIndex(working, op);
    let o = op.op;
    if (existingIndex === -1 && op.op == 'update') {
      log("warn", `Trying to update non-existent item ${op.name}, adding instead.`)
      o = 'add'
    }

    if (existingIndex === -1 && op.op == 'remove') {
      log("warn", `Trying to remove non-existent item ${op.name}, doing nothing.`)
      return;
    }

    if (existingIndex !== -1 && op.op == 'add') {
      log("warn", `Trying to add existent item ${op.name}, updating instead.`)
      o = 'update'
    }

    switch (o) {
      case "update":
        working[existingIndex].description = op.description;
        working[existingIndex].effect = op.effect || working[existingIndex].effect;
        working[existingIndex].quantity = op.quantity;
        break;
      case "add":
        const item: InventoryEntry = {
          id: toSnakeCase(op.name),
          kind: op.kind as InventoryEntryKind,
          name: op.name,
          description: op.description,
          effect: op.effect || "",
          quantity: op.quantity,
        }
        context.chronicleState.character?.inventory.push(item);
        break;
      case "remove":
        working.splice(existingIndex, 1);
        break;
    }
  })

  return working;
}

function itemIndex(inventory: Inventory, item: InventoryDeltaOp): number {
  const id = toSnakeCase(item.name);
  return inventory.findIndex((entry) => {
    if (entry.id !== id) {
      return false;
    }

    if (entry.kind !== item.kind) {
      log("warn", "Item trying to change kind, dropping kind change.")
    }

    return true;
  });
}