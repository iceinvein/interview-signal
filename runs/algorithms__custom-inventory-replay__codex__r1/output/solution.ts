export function replayInventory(events: string[]): [string, number][] {
  const stock = new Map<string, number>();
  const history: [string, number][] = [];
  let applied = 0;

  function change(item: string, delta: number): void {
    const quantity = (stock.get(item) ?? 0) + delta;
    if (quantity === 0) {
      stock.delete(item);
    } else {
      stock.set(item, quantity);
    }
  }

  for (const event of events) {
    if (event === "undo") {
      if (applied > 0) {
        const [item, delta] = history[--applied];
        change(item, -delta);
      }
    } else if (event === "redo") {
      if (applied < history.length) {
        const [item, delta] = history[applied++];
        change(item, delta);
      }
    } else {
      const [action, item, quantityText] = event.split(" ");
      const quantity = Number(quantityText);
      const delta = action === "add" ? quantity : -quantity;

      if (delta < 0 && (stock.get(item) ?? 0) < quantity) {
        continue;
      }

      history.length = applied;
      history.push([item, delta]);
      applied++;
      change(item, delta);
    }
  }

  return [...stock].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}
