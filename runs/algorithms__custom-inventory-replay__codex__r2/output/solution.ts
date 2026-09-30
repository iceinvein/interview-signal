export function replayInventory(events: string[]): [string, number][] {
  const stock = new Map<string, number>();
  const history: [string, number][] = [];
  let appliedCount = 0;

  for (const event of events) {
    if (event === "undo") {
      if (appliedCount > 0) {
        const [item, change] = history[--appliedCount];
        stock.set(item, (stock.get(item) ?? 0) - change);
      }
      continue;
    }

    if (event === "redo") {
      if (appliedCount < history.length) {
        const [item, change] = history[appliedCount++];
        stock.set(item, (stock.get(item) ?? 0) + change);
      }
      continue;
    }

    const [command, item, quantityText] = event.split(" ");
    const quantity = Number(quantityText);
    const current = stock.get(item) ?? 0;
    if (command === "remove" && current < quantity) continue;

    const change = command === "add" ? quantity : -quantity;
    history.length = appliedCount;
    history.push([item, change]);
    appliedCount++;
    stock.set(item, current + change);
  }

  return Array.from(stock, ([item, quantity]): [string, number] => [item, quantity])
    .filter(([, quantity]) => quantity > 0)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
}
