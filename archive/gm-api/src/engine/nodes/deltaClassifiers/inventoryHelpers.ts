import type { Inventory } from '@glass-frontier/worldstate';

export const summarizeInventory = (inventory: Inventory): string => {
  const carried =
    inventory.carried.length > 0
      ? `Carried: ${inventory.carried.map((item) => item.name).join(', ')}`
      : 'Carried: none';
  const equippedEntries = Object.entries(inventory.equipped ?? {});
  const equippedDescription = equippedEntries
    .map(([slot, item]) => `${slot} -> ${item?.name ?? 'Empty'}`)
    .join(', ');
  const equipped =
    equippedEntries.length > 0 ? `Equipped: ${equippedDescription}` : 'Equipped: none';
  const stored =
    inventory.stored.length > 0
      ? `Stored: ${inventory.stored.slice(0, 5).map((item) => item.name).join(', ')}`
      : 'Stored: none';
  return `${carried}\n${equipped}\n${stored}`;
};
