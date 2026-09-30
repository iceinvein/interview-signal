export function evaluateSheet(cells: Record<string, string>): Record<string, number | "#CYCLE"> {
  const names = Object.keys(cells);
  const n = names.length;
  const id = new Map<string, number>();
  for (let i = 0; i < n; i++) id.set(names[i], i);

  const val = new Array<number>(n).fill(0);
  const cnt = new Int32Array(n);
  const rev: number[][] = new Array(n);
  for (let i = 0; i < n; i++) rev[i] = [];

  for (let i = 0; i < n; i++) {
    const s = cells[names[i]];
    if (s.charCodeAt(0) !== 61) {
      val[i] = Number(s);
      continue;
    }
    let sum = 0;
    for (const t of s.slice(1).split("+")) {
      const c = t.charCodeAt(0);
      if (c >= 65 && c <= 90) {
        const j = id.get(t);
        if (j !== undefined) {
          cnt[i]++;
          rev[j].push(i);
        }
      } else {
        sum += Number(t);
      }
    }
    val[i] = sum;
  }

  const queue: number[] = [];
  for (let i = 0; i < n; i++) if (cnt[i] === 0) queue.push(i);
  const done = new Uint8Array(n);
  for (let h = 0; h < queue.length; h++) {
    const d = queue[h];
    done[d] = 1;
    const v = val[d];
    for (const x of rev[d]) {
      val[x] += v;
      if (--cnt[x] === 0) queue.push(x);
    }
  }

  const out: Record<string, number | "#CYCLE"> = {};
  for (let i = 0; i < n; i++) out[names[i]] = done[i] ? val[i] : "#CYCLE";
  return out;
}
