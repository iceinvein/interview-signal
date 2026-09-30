export function evaluateSheet(cells: Record<string, string>): Record<string, number | "#CYCLE"> {
  const names = Object.keys(cells);
  const count = names.length;
  const indexByName = new Map<string, number>();

  for (let i = 0; i < count; i++) {
    indexByName.set(names[i], i);
  }

  const values = new Array<number>(count).fill(0);
  const remaining = new Array<number>(count).fill(0);
  const dependents: number[][] = new Array(count);

  for (let i = 0; i < count; i++) {
    const content = cells[names[i]];
    if (content[0] !== "=") {
      values[i] = Number(content);
      continue;
    }

    for (let start = 1; start < content.length;) {
      let end = content.indexOf("+", start);
      if (end === -1) end = content.length;

      const first = content.charCodeAt(start);
      if (first === 45 || (first >= 48 && first <= 57)) {
        values[i] += Number(content.slice(start, end));
      } else {
        const dependency = indexByName.get(content.slice(start, end));
        if (dependency !== undefined) {
          remaining[i]++;
          if (dependents[dependency] === undefined) dependents[dependency] = [];
          dependents[dependency].push(i);
        }
      }

      start = end + 1;
    }
  }

  const queue: number[] = [];
  for (let i = 0; i < count; i++) {
    if (remaining[i] === 0) queue.push(i);
  }

  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    const listeners = dependents[current];
    if (listeners === undefined) continue;

    for (const listener of listeners) {
      values[listener] += values[current];
      remaining[listener]--;
      if (remaining[listener] === 0) queue.push(listener);
    }
  }

  const result: Record<string, number | "#CYCLE"> = {};
  for (let i = 0; i < count; i++) {
    result[names[i]] = remaining[i] === 0 ? values[i] : "#CYCLE";
  }
  return result;
}
