export function evaluateSheet(cells: Record<string, string>): Record<string, number | "#CYCLE"> {
  const names = Object.keys(cells);
  const n = names.length;
  const index = new Map<string, number>();
  for (let i = 0; i < n; i++) index.set(names[i], i);

  // base[i]: sum of literal terms; deps[i]: indices of filled cells referenced (with multiplicity)
  const base = new Array<number>(n).fill(0);
  const pending = new Int32Array(n);
  const dependents: number[][] = new Array(n);
  const refs: number[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    dependents[i] = [];
    refs[i] = [];
  }

  for (let i = 0; i < n; i++) {
    const s = cells[names[i]];
    if (s.charCodeAt(0) !== 61 /* = */) {
      base[i] = parseInt(s, 10);
      continue;
    }
    let sum = 0;
    const terms = s.slice(1).split("+");
    for (const t of terms) {
      const c = t.charCodeAt(0);
      if (c >= 65 && c <= 90) {
        const j = index.get(t);
        if (j !== undefined) {
          refs[i].push(j);
          dependents[j].push(i);
          pending[i]++;
        }
      } else {
        sum += parseInt(t, 10);
      }
    }
    base[i] = sum;
  }

  // Kahn's algorithm: a cell resolves once all its referenced filled cells resolve.
  const value = base.slice();
  const done = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i++) if (pending[i] === 0) queue[tail++] = i;
  while (head < tail) {
    const i = queue[head++];
    let v = base[i];
    for (const j of refs[i]) v += value[j];
    value[i] = v;
    done[i] = 1;
    for (const k of dependents[i]) {
      if (--pending[k] === 0) queue[tail++] = k;
    }
  }

  const result: Record<string, number | "#CYCLE"> = {};
  for (let i = 0; i < n; i++) result[names[i]] = done[i] ? value[i] : "#CYCLE";
  return result;
}
