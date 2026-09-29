type Action = { item: string; delta: number };

export function replayInventory(events: string[]): [string, number][] {
  const stock = new Map<string, number>();
  const done: Action[] = [];
  const undone: Action[] = [];
  const apply = (action: Action, sign: number) => {
    stock.set(action.item, (stock.get(action.item) ?? 0) + sign * action.delta);
  };

  for (const event of events) {
    if (event === "undo") {
      const action = done.pop();
      if (action !== undefined) {
        apply(action, -1);
        undone.push(action);
      }
      continue;
    }
    if (event === "redo") {
      const action = undone.pop();
      if (action !== undefined) {
        apply(action, 1);
        done.push(action);
      }
      continue;
    }
    const [verb, item, qtyText] = event.split(" ");
    const qty = Number(qtyText);
    if (verb === "remove" && (stock.get(item) ?? 0) < qty) continue;
    const action = { item, delta: verb === "add" ? qty : -qty };
    apply(action, 1);
    done.push(action);
    undone.length = 0;
  }

  const result: [string, number][] = [];
  for (const [item, quantity] of stock) {
    if (quantity > 0) result.push([item, quantity]);
  }
  return result.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}
