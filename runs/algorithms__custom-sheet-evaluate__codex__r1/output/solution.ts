export function evaluateSheet(cells: Record<string, string>): Record<string, number | "#CYCLE"> {
  const names = Object.keys(cells);
  const count = names.length;
  const indexByName = new Map<string, number>();
  for (let i = 0; i < count; i++) indexByName.set(names[i], i);

  const values = new Float64Array(count);
  const remaining = new Int32Array(count);
  const head = new Int32Array(count);
  head.fill(-1);
  const dependent: number[] = [];
  const next: number[] = [];

  for (let i = 0; i < count; i++) {
    const content = cells[names[i]];
    if (content[0] !== "=") {
      values[i] = Number(content);
      continue;
    }

    let start = 1;
    while (start < content.length) {
      const separator = content.indexOf("+", start);
      const end = separator === -1 ? content.length : separator;
      const term = content.slice(start, end);
      const first = term[0];

      if (first === "-" || (first >= "0" && first <= "9")) {
        values[i] += Number(term);
      } else {
        const dependency = indexByName.get(term);
        if (dependency !== undefined) {
          // Each occurrence contributes separately, including repeated references.
          dependent.push(i);
          next.push(head[dependency]);
          head[dependency] = dependent.length - 1;
          remaining[i]++;
        }
      }

      start = end + 1;
    }
  }

  const queue = new Int32Array(count);
  let tail = 0;
  for (let i = 0; i < count; i++) {
    if (remaining[i] === 0) queue[tail++] = i;
  }

  for (let front = 0; front < tail; front++) {
    const resolved = queue[front];
    for (let edge = head[resolved]; edge !== -1; edge = next[edge]) {
      const target = dependent[edge];
      values[target] += values[resolved];
      if (--remaining[target] === 0) queue[tail++] = target;
    }
  }

  const result: Record<string, number | "#CYCLE"> = {};
  for (let i = 0; i < count; i++) {
    result[names[i]] = remaining[i] === 0 ? values[i] : "#CYCLE";
  }
  return result;
}
