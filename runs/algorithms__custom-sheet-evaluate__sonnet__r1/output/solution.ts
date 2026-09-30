export function evaluateSheet(cells: Record<string, string>): Record<string, number | "#CYCLE"> {
  const names = Object.keys(cells);
  const n = names.length;
  const index = new Map<string, number>();
  for (let i = 0; i < n; i++) index.set(names[i], i);

  const constant = new Float64Array(n);
  const deps: number[][] = new Array(n);
  const pending = new Int32Array(n);
  const dependents: number[][] = new Array(n);
  for (let i = 0; i < n; i++) dependents[i] = [];

  for (let i = 0; i < n; i++) {
    const s = cells[names[i]];
    const d: number[] = [];
    deps[i] = d;
    if (s.charCodeAt(0) !== 61) {
      constant[i] = Number(s);
      continue;
    }
    let c = 0;
    for (const term of s.slice(1).split("+")) {
      const ch = term.charCodeAt(0);
      if (ch === 45 || (ch >= 48 && ch <= 57)) {
        c += Number(term);
      } else {
        const j = index.get(term);
        if (j !== undefined) {
          d.push(j);
          dependents[j].push(i);
        }
      }
    }
    constant[i] = c;
    pending[i] = d.length;
  }

  const value = new Float64Array(n);
  const done = new Uint8Array(n);
  const queue: number[] = [];
  for (let i = 0; i < n; i++) if (pending[i] === 0) queue.push(i);
  for (let h = 0; h < queue.length; h++) {
    const i = queue[h];
    let v = constant[i];
    for (const j of deps[i]) v += value[j];
    value[i] = v;
    done[i] = 1;
    for (const k of dependents[i]) {
      if (--pending[k] === 0) queue.push(k);
    }
  }

  const result: Record<string, number | "#CYCLE"> = {};
  for (let i = 0; i < n; i++) result[names[i]] = done[i] ? value[i] : "#CYCLE";
  return result;
}
