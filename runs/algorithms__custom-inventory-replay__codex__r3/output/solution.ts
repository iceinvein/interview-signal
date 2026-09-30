export function replayInventory(events: string[]): [string, number][] {
  const stock = new Map<string, number>();
  const undoStack: [string, number][] = [];
  const redoStack: [string, number][] = [];

  function changeStock(item: string, delta: number): void {
    const next = (stock.get(item) ?? 0) + delta;
    if (next === 0) {
      stock.delete(item);
    } else {
      stock.set(item, next);
    }
  }

  for (const event of events) {
    if (event === "undo") {
      const action = undoStack.pop();
      if (action !== undefined) {
        changeStock(action[0], -action[1]);
        redoStack.push(action);
      }
    } else if (event === "redo") {
      const action = redoStack.pop();
      if (action !== undefined) {
        changeStock(action[0], action[1]);
        undoStack.push(action);
      }
    } else {
      const [operation, item, quantity] = event.split(" ");
      const amount = Number(quantity);
      if (operation === "remove" && (stock.get(item) ?? 0) < amount) {
        continue;
      }

      const delta = operation === "add" ? amount : -amount;
      changeStock(item, delta);
      undoStack.push([item, delta]);
      redoStack.length = 0;
    }
  }

  return [...stock].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}
