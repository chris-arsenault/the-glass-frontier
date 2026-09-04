import type { InventoryDelta } from '@glass-frontier/dto';
import { describe, expect, it } from 'vitest';

import type { GraphContext } from '../src/types';
import { createUpdatedInventory } from '../src/updaters/inventoryUpdater';
import { buildContext } from './harness';

const contextWith = (inventoryDelta: InventoryDelta): GraphContext => {
  const context = buildContext({ inventoryDelta });
  context.chronicleState.character.inventory = [{
    description: 'A short iron pry bar.',
    effect: 'Opens stubborn housings.',
    id: 'crowbar',
    kind: 'gear',
    name: 'Crowbar',
    quantity: 1,
  }];
  return context;
};

describe('createUpdatedInventory', () => {
  it('drops updates for objects absent from the canonical inventory', () => {
    const inventory = createUpdatedInventory(contextWith({
      ops: [{
        description: 'Bruised when the panel slipped.',
        effect: null,
        kind: 'gear',
        name: 'Left Shoulder',
        op: 'update',
        quantity: 1,
      }],
    }));

    expect(inventory.map((item) => item.name)).toEqual(['Crowbar']);
  });

  it('treats a zero-quantity update as removal', () => {
    const inventory = createUpdatedInventory(contextWith({
      ops: [{
        description: 'Lost down the relay shaft.',
        effect: null,
        kind: 'gear',
        name: 'Crowbar',
        op: 'update',
        quantity: 0,
      }],
    }));

    expect(inventory).toEqual([]);
  });

  it('normalizes placeholder effects instead of persisting them as prose', () => {
    const inventory = createUpdatedInventory(contextWith({
      ops: [{
        description: 'A coil of clean copper wire.',
        effect: 'null',
        kind: 'supplies',
        name: 'Copper Wire',
        op: 'add',
        quantity: 1,
      }],
    }));

    expect(inventory.find((item) => item.name === 'Copper Wire')?.effect).toBeUndefined();
  });

  it('clears an existing effect when an update explicitly returns null', () => {
    const inventory = createUpdatedInventory(contextWith({
      ops: [{
        description: 'A bent iron pry bar.',
        effect: null,
        kind: 'gear',
        name: 'Crowbar',
        op: 'update',
        quantity: 1,
      }],
    }));

    expect(inventory[0]?.effect).toBeUndefined();
  });
});
