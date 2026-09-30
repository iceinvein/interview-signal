export function replayInventory(events: string[]): [string, number][] {
  const inventory = new Map<string, number>();
  const operations: Array<{type: 'add' | 'remove', item: string, qty: number}> = [];
  let currentIndex = 0; // number of operations currently applied

  for (const event of events) {
    const parts = event.split(' ');
    const command = parts[0];

    if (command === 'add') {
      const item = parts[1];
      const qty = parseInt(parts[2]);

      // Truncate operation history and record new add
      operations.length = currentIndex;
      operations.push({type: 'add', item, qty});
      currentIndex++;

      inventory.set(item, (inventory.get(item) ?? 0) + qty);
    }
    else if (command === 'remove') {
      const item = parts[1];
      const qty = parseInt(parts[2]);

      const currentQty = inventory.get(item) ?? 0;
      if (currentQty < qty) {
        // Rejected remove - not recorded
        continue;
      }

      // Truncate operation history and record new remove
      operations.length = currentIndex;
      operations.push({type: 'remove', item, qty});
      currentIndex++;

      inventory.set(item, currentQty - qty);
    }
    else if (command === 'undo') {
      if (currentIndex > 0) {
        currentIndex--;
        // Recompute inventory from scratch by replaying all non-undone operations
        inventory.clear();
        for (let i = 0; i < currentIndex; i++) {
          const op = operations[i];
          if (op.type === 'add') {
            inventory.set(op.item, (inventory.get(op.item) ?? 0) + op.qty);
          } else {
            inventory.set(op.item, (inventory.get(op.item) ?? 0) - op.qty);
          }
        }
      }
    }
    else if (command === 'redo') {
      if (currentIndex < operations.length) {
        const op = operations[currentIndex];
        if (op.type === 'add') {
          inventory.set(op.item, (inventory.get(op.item) ?? 0) + op.qty);
        } else {
          inventory.set(op.item, (inventory.get(op.item) ?? 0) - op.qty);
        }
        currentIndex++;
      }
    }
  }

  // Build result with items that have stock > 0
  const result: [string, number][] = [];
  for (const [item, qty] of inventory) {
    if (qty > 0) {
      result.push([item, qty]);
    }
  }

  // Sort by item name using character-code order
  result.sort((a, b) => a[0] < b[0] ? -1 : 1);
  return result;
}
