export function evaluateSheet(cells: Record<string, string>): Record<string, number | "#CYCLE"> {
  const names = Object.keys(cells);
  const count = names.length;
  const indices = new Map<string, number>();
  for (let i = 0; i < count; i++) indices.set(names[i], i);

  // Each edge runs from a referenced cell to a cell that uses its value.
  const firstEdge = new Int32Array(count);
  firstEdge.fill(-1);
  const nextEdge: number[] = [];
  const dependent: number[] = [];
  const remaining = new Uint32Array(count);

  for (let i = 0; i < count; i++) {
    const content = cells[names[i]];
    if (content[0] !== "=") continue;

    let start = 1;
    while (start < content.length) {
      const separator = content.indexOf("+", start);
      const end = separator === -1 ? content.length : separator;
      const firstChar = content.charCodeAt(start);
      if (firstChar >= 65 && firstChar <= 90) {
        const source = indices.get(content.slice(start, end));
        if (source !== undefined) {
          dependent.push(i);
          nextEdge.push(firstEdge[source]);
          firstEdge[source] = dependent.length - 1;
          remaining[i]++;
        }
      }
      start = end + 1;
    }
  }

  const values = new Float64Array(count);
  const resolved = new Uint8Array(count);
  const queue: number[] = [];
  for (let i = 0; i < count; i++) {
    if (remaining[i] === 0) queue.push(i);
  }

  for (let front = 0; front < queue.length; front++) {
    const i = queue[front];
    const content = cells[names[i]];
    let value = 0;

    if (content[0] === "=") {
      let start = 1;
      while (start < content.length) {
        const separator = content.indexOf("+", start);
        const end = separator === -1 ? content.length : separator;
        const firstChar = content.charCodeAt(start);
        if (firstChar >= 65 && firstChar <= 90) {
          const source = indices.get(content.slice(start, end));
          if (source !== undefined) value += values[source];
        } else {
          value += Number(content.slice(start, end));
        }
        start = end + 1;
      }
    } else {
      value = Number(content);
    }

    values[i] = value;
    resolved[i] = 1;
    for (let edge = firstEdge[i]; edge !== -1; edge = nextEdge[edge]) {
      const target = dependent[edge];
      if (--remaining[target] === 0) queue.push(target);
    }
  }

  const result: Record<string, number | "#CYCLE"> = {};
  for (let i = 0; i < count; i++) {
    result[names[i]] = resolved[i] ? values[i] : "#CYCLE";
  }
  return result;
}
