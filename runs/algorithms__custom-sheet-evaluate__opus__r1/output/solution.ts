export function evaluateSheet(cells: Record<string, string>): Record<string, number | "#CYCLE"> {
  const names = Object.keys(cells);
  const n = names.length;
  const index = new Map<string, number>();
  for (let i = 0; i < n; i++) index.set(names[i], i);

  // Per cell: constant part of the sum, and dependency edges (with multiplicity).
  const base = new Float64Array(n);
  const indeg = new Int32Array(n);
  const edgeFrom: number[] = []; // dependency
  const edgeTo: number[] = []; // dependent

  for (let i = 0; i < n; i++) {
    const s = cells[names[i]];
    if (s.charCodeAt(0) !== 61 /* = */) {
      base[i] = Number(s);
      continue;
    }
    let sum = 0;
    let start = 1;
    const len = s.length;
    for (let p = 1; p <= len; p++) {
      if (p === len || s.charCodeAt(p) === 43 /* + */) {
        const term = s.slice(start, p);
        const c = term.charCodeAt(0);
        if (c >= 65 && c <= 90) {
          const j = index.get(term);
          if (j !== undefined) {
            edgeFrom.push(j);
            edgeTo.push(i);
            indeg[i]++;
          }
        } else {
          sum += Number(term);
        }
        start = p + 1;
      }
    }
    base[i] = sum;
  }

  // CSR adjacency: dependency -> dependents.
  const m = edgeFrom.length;
  const offs = new Int32Array(n + 1);
  for (let e = 0; e < m; e++) offs[edgeFrom[e] + 1]++;
  for (let i = 0; i < n; i++) offs[i + 1] += offs[i];
  const adj = new Int32Array(m);
  const fill = offs.slice(0, n);
  for (let e = 0; e < m; e++) adj[fill[edgeFrom[e]]++] = edgeTo[e];

  // Kahn's algorithm; anything never dequeued is on or depends on a cycle.
  const value = base; // accumulates dependency contributions
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i++) if (indeg[i] === 0) queue[tail++] = i;
  const done = new Uint8Array(n);
  while (head < tail) {
    const u = queue[head++];
    done[u] = 1;
    const v = value[u];
    for (let k = offs[u]; k < offs[u + 1]; k++) {
      const w = adj[k];
      value[w] += v;
      if (--indeg[w] === 0) queue[tail++] = w;
    }
  }

  const result: Record<string, number | "#CYCLE"> = {};
  for (let i = 0; i < n; i++) result[names[i]] = done[i] ? value[i] : "#CYCLE";
  return result;
}
