export function replayInventory(events: string[]): [string, number][] {
  const stock = new Map<string, number>();
  // Each action stored as a signed delta applied to an item.
  const undoStack: [string, number][] = [];
  const redoStack: [string, number][] = [];

  const apply = (item: string, delta: number): void => {
    stock.set(item, (stock.get(item) ?? 0) + delta);
  };

  for (const event of events) {
    if (event === "undo") {
      const action = undoStack.pop();
      if (action) {
        apply(action[0], -action[1]);
        redoStack.push(action);
      }
      continue;
    }
    if (event === "redo") {
      const action = redoStack.pop();
      if (action) {
        apply(action[0], action[1]);
        undoStack.push(action);
      }
      continue;
    }

    const first = event.indexOf(" ");
    const second = event.indexOf(" ", first + 1);
    const op = event.slice(0, first);
    const item = event.slice(first + 1, second);
    const qty = Number(event.slice(second + 1));

    let delta: number;
    if (op === "add") {
      delta = qty;
    } else {
      if ((stock.get(item) ?? 0) < qty) continue; // rejected: not recorded
      delta = -qty;
    }
    apply(item, delta);
    undoStack.push([item, delta]);
    redoStack.length = 0;
  }

  const result: [string, number][] = [];
  for (const [item, qty] of stock) {
    if (qty > 0) result.push([item, qty]);
  }
  result.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return result;
}
