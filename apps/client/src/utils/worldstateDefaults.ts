import type { Inventory } from '@glass-frontier/worldstate/dto';

export const createEmptyInventory = (): Inventory => ({
  carried: [],
  stored: [],
  equipped: {},
  capacity: 10,
});
