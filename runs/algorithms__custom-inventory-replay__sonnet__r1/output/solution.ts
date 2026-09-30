export function replayInventory(events: string[]): [string, number][] {
  const stock = new Map<string, number>();
  const done: [string, number][] = [];
  let undone: [string, number][] = [];

  const apply = (item: string, delta: number) => {
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
      } else {
        if ((stock.get(item) ?? 0) < qty) continue;
        apply(item, -qty);
      }
      done.push([item, op === "add" ? qty : -qty]);
      if (undone.length) undone = [];
    }
  }

  const res: [string, number][] = [];
  for (const [k, v] of stock) if (v > 0) res.push([k, v]);
  res.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return res;
}
