export function evaluateSheet(cells: Record<string, string>): Record<string, number | "#CYCLE"> {
  const names = Object.keys(cells);
  const n = names.length;
  const index = new Map<string, number>();
  for (let i = 0; i < n; i++) index.set(names[i], i);

  const acc = new Float64Array(n);
  const pending = new Int32Array(n);
  // reverse edges (one entry per occurrence) as linked lists
  const head = new Int32Array(n).fill(-1);
  const nextEdge: number[] = [];
  const edgeTo: number[] = [];

  for (let i = 0; i < n; i++) {
    const s = cells[names[i]];
    if (s.charCodeAt(0) !== 61) {
      acc[i] = Number(s);
      continue;
    }
    const terms = s.slice(1).split("+");
    for (const t of terms) {
      const c = t.charCodeAt(0);
      if (c === 45 || (c >= 48 && c <= 57)) {
        acc[i] += Number(t);
      } else {
        const j = index.get(t);
        if (j === undefined) continue;
        pending[i]++;
        edgeTo.push(i);
        nextEdge.push(head[j]);
        head[j] = edgeTo.length - 1;
      }
    }
  }

  const queue = new Int32Array(n);
  let qh = 0;
  let qt = 0;
  for (let i = 0; i < n; i++) if (pending[i] === 0) queue[qt++] = i;
  while (qh < qt) {
    const d = queue[qh++];
    for (let e = head[d]; e !== -1; e = nextEdge[e]) {
      const c = edgeTo[e];
      acc[c] += acc[d];
      if (--pending[c] === 0) queue[qt++] = c;
    }
  }

  const result: Record<string, number | "#CYCLE"> = {};
  for (let i = 0; i < n; i++) result[names[i]] = pending[i] === 0 ? acc[i] : "#CYCLE";
  return result;
}
