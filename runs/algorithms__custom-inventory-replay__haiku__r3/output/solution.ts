export function replayInventory(events: string[]): [string, number][] {
  const inventory = new Map<string, number>();
  const undoStack: Array<{ type: 'add' | 'remove'; item: string; qty: number }> = [];
  const redoStack: Array<{ type: 'add' | 'remove'; item: string; qty: number }> = [];

  for (const event of events) {
    const parts = event.split(' ');
    const command = parts[0];

    if (command === 'add') {
      const item = parts[1];
      const qty = parseInt(parts[2], 10);
      const currentQty = inventory.get(item) || 0;
      inventory.set(item, currentQty + qty);
      undoStack.push({ type: 'add', item, qty });
      redoStack.length = 0; // Clear redo stack when recording new action
    } else if (command === 'remove') {
      const item = parts[1];
      const qty = parseInt(parts[2], 10);
      const currentQty = inventory.get(item) || 0;
      if (currentQty >= qty) {
        // Remove is valid
        inventory.set(item, currentQty - qty);
        undoStack.push({ type: 'remove', item, qty });
        redoStack.length = 0; // Clear redo stack when recording new action
      }
      // If rejected, do nothing (including not clearing redo stack)
    } else if (command === 'undo') {
      if (undoStack.length > 0) {
        const action = undoStack.pop()!;
        // Reverse the action
        if (action.type === 'add') {
          const currentQty = inventory.get(action.item) || 0;
          inventory.set(action.item, currentQty - action.qty);
        } else {
          const currentQty = inventory.get(action.item) || 0;
          inventory.set(action.item, currentQty + action.qty);
        }
        redoStack.push(action);
      }
    } else if (command === 'redo') {
      if (redoStack.length > 0) {
        const action = redoStack.pop()!;
        // Re-apply the action
        if (action.type === 'add') {
          const currentQty = inventory.get(action.item) || 0;
          inventory.set(action.item, currentQty + action.qty);
        } else {
          const currentQty = inventory.get(action.item) || 0;
          inventory.set(action.item, currentQty - action.qty);
        }
        undoStack.push(action);
      }
    }
  }

  // Build result: items with qty > 0, sorted by name using character-code order
  const result: [string, number][] = [];
  for (const [item, qty] of inventory.entries()) {
    if (qty > 0) {
      result.push([item, qty]);
    }
  }
  result.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

  return result;
}
