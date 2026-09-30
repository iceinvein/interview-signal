export function replayInventory(events: string[]): [string, number][] {
  const stock = new Map<string, number>();
  // Each action: [item, signed delta]
  const done: [string, number][] = [];
  const undone: [string, number][] = [];

  const apply = (item: string, delta: number): void => {
    stock.set(item, (stock.get(item) ?? 0) + delta);
  };

  for (const ev of events) {
    if (ev === "undo") {
      const a = done.pop();
      if (a) {
        apply(a[0], -a[1]);
        undone.push(a);
      }
    } else if (ev === "redo") {
      const a = undone.pop();
      if (a) {
        apply(a[0], a[1]);
        done.push(a);
      }
    } else {
      const [op, item, q] = ev.split(" ");
      const qty = Number(q);
      if (op === "add") {
        apply(item, qty);
      } else if ((stock.get(item) ?? 0) >= qty) {
        apply(item, -qty);
      } else {
        continue;
      }
      done.push([item, op === "add" ? qty : -qty]);
      undone.length = 0;
    }
  }

  const result: [string, number][] = [];
  for (const [item, n] of stock) if (n > 0) result.push([item, n]);
  result.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return result;
}
