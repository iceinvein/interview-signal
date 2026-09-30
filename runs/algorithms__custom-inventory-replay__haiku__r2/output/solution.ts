export function replayInventory(events: string[]): [string, number][] {
  const inventory = new Map<string, number>();
  const actionStack: Array<{ type: 'add' | 'remove'; item: string; qty: number }> = [];
  const redoStack: Array<{ type: 'add' | 'remove'; item: string; qty: number }> = [];

  for (const event of events) {
    const parts = event.split(' ');
    const command = parts[0];

    if (command === 'add') {
      const item = parts[1];
      const qty = parseInt(parts[2], 10);
      const current = inventory.get(item) || 0;
      inventory.set(item, current + qty);
      actionStack.push({ type: 'add', item, qty });
      redoStack.length = 0;
    } else if (command === 'remove') {
      const item = parts[1];
      const qty = parseInt(parts[2], 10);
      const current = inventory.get(item) || 0;
      if (current >= qty) {
        inventory.set(item, current - qty);
        actionStack.push({ type: 'remove', item, qty });
        redoStack.length = 0;
      }
    } else if (command === 'undo') {
      if (actionStack.length > 0) {
        const action = actionStack.pop()!;
        if (action.type === 'add') {
          const current = inventory.get(action.item) || 0;
          inventory.set(action.item, current - action.qty);
        } else {
          const current = inventory.get(action.item) || 0;
          inventory.set(action.item, current + action.qty);
        }
        redoStack.push(action);
      }
    } else if (command === 'redo') {
      if (redoStack.length > 0) {
        const action = redoStack.pop()!;
        if (action.type === 'add') {
          const current = inventory.get(action.item) || 0;
          inventory.set(action.item, current + action.qty);
        } else {
          const current = inventory.get(action.item) || 0;
          inventory.set(action.item, current - action.qty);
        }
        actionStack.push(action);
      }
    }
  }

  const result: [string, number][] = [];
  for (const [item, qty] of inventory) {
    if (qty > 0) {
      result.push([item, qty]);
    }
  }

  result.sort((a, b) => {
    if (a[0] < b[0]) return -1;
    if (a[0] > b[0]) return 1;
    return 0;
  });

  return result;
}
