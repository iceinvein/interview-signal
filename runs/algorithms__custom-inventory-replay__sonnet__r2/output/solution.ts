export function replayInventory(events: string[]): [string, number][] {
  const stock = new Map<string, number>();
  // Each action: [item, signed delta]
  const undoStack: [string, number][] = [];
  let redoStack: [string, number][] = [];

  const apply = (item: string, delta: number) => {
    stock.set(item, (stock.get(item) ?? 0) + delta);
  };

  for (const ev of events) {
    if (ev === "undo") {
      const a = undoStack.pop();
      if (a) {
        apply(a[0], -a[1]);
        redoStack.push(a);
      }
    } else if (ev === "redo") {
      const a = redoStack.pop();
      if (a) {
        apply(a[0], a[1]);
        undoStack.push(a);
      }
    } else {
      const [op, item, q] = ev.split(" ");
      const qty = Number(q);
      const delta = op === "add" ? qty : -qty;
      if (delta < 0 && (stock.get(item) ?? 0) < qty) continue;
      apply(item, delta);
      undoStack.push([item, delta]);
      redoStack = [];
    }
  }

  const result: [string, number][] = [];
  for (const [item, n] of stock) if (n > 0) result.push([item, n]);
  result.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return result;
}
