export function replayInventory(events: string[]): [string, number][] {
  const stock = new Map<string, number>();
  // Each recorded action stores the item and its signed delta.
  const undoItems: string[] = [];
  const undoDeltas: number[] = [];
  const redoItems: string[] = [];
  const redoDeltas: number[] = [];

  const apply = (item: string, delta: number): void => {
    stock.set(item, (stock.get(item) ?? 0) + delta);
  };

  for (const event of events) {
    if (event === "undo") {
      if (undoItems.length === 0) continue;
      const item = undoItems.pop()!;
      const delta = undoDeltas.pop()!;
      apply(item, -delta);
      redoItems.push(item);
      redoDeltas.push(delta);
    } else if (event === "redo") {
      if (redoItems.length === 0) continue;
      const item = redoItems.pop()!;
      const delta = redoDeltas.pop()!;
      apply(item, delta);
      undoItems.push(item);
      undoDeltas.push(delta);
    } else {
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
      undoItems.push(item);
      undoDeltas.push(delta);
      redoItems.length = 0;
      redoDeltas.length = 0;
    }
  }

  const result: [string, number][] = [];
  for (const [item, qty] of stock) {
    if (qty > 0) result.push([item, qty]);
  }
  result.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return result;
}
