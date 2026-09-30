export function evaluateSheet(cells: Record<string, string>): Record<string, number | "#CYCLE"> {
  const names = Object.keys(cells);
  const n = names.length;
  const index = new Map<string, number>();
  for (let i = 0; i < n; i++) index.set(names[i], i);

  // Per cell: constant part of the sum, and the (filled) cells it references.
  const base = new Float64Array(n);
  const depStart = new Int32Array(n + 1);
  const deps: number[] = [];
  for (let i = 0; i < n; i++) {
    depStart[i] = deps.length;
    const content = cells[names[i]];
    if (content.charCodeAt(0) !== 61 /* = */) {
      base[i] = Number(content);
      continue;
    }
    let sum = 0;
    for (const term of content.slice(1).split("+")) {
      const c = term.charCodeAt(0);
      if (c === 45 /* - */ || (c >= 48 && c <= 57)) {
        sum += Number(term);
      } else {
        const j = index.get(term);
        if (j !== undefined) deps.push(j);
      }
    }
    base[i] = sum;
  }
  depStart[n] = deps.length;

  // Iterative DFS. state: 0 = unvisited, 1 = on stack, 2 = done.
  const state = new Uint8Array(n);
  const cyc = new Uint8Array(n);
  const value = new Float64Array(n);
  const stack = new Int32Array(n);
  const pos = new Int32Array(n);

  for (let s = 0; s < n; s++) {
    if (state[s] !== 0) continue;
    let top = 0;
    stack[0] = s;
    state[s] = 1;
    pos[s] = depStart[s];
    value[s] = base[s];
    while (top >= 0) {
      const v = stack[top];
      if (pos[v] < depStart[v + 1]) {
        const w = deps[pos[v]++];
        if (state[w] === 0) {
          state[w] = 1;
          pos[w] = depStart[w];
          value[w] = base[w];
          stack[++top] = w;
        } else if (state[w] === 1) {
          cyc[v] = 1;
        } else if (cyc[w]) {
          cyc[v] = 1;
        } else {
          value[v] += value[w];
        }
      } else {
        state[v] = 2;
        top--;
        if (top >= 0) {
          const p = stack[top];
          if (cyc[v]) cyc[p] = 1;
          else value[p] += value[v];
        }
      }
    }
  }

  const result: Record<string, number | "#CYCLE"> = {};
  for (let i = 0; i < n; i++) result[names[i]] = cyc[i] ? "#CYCLE" : value[i];
  return result;
}
