export function minWindowSubsequence(s: string, t: string): string {
  const n = s.length;
  const m = t.length;
  // nxt[i * 26 + c] = smallest index >= i where s has letter c, or -1.
  const nxt = new Int32Array((n + 1) * 26).fill(-1);
  for (let i = n - 1; i >= 0; i--) {
    nxt.copyWithin(i * 26, (i + 1) * 26, (i + 2) * 26);
    nxt[i * 26 + s.charCodeAt(i) - 97] = i;
  }
  const tc = new Int32Array(m);
  for (let k = 0; k < m; k++) tc[k] = t.charCodeAt(k) - 97;

  let bestStart = -1;
  let bestLen = Infinity;
  for (let i = nxt[tc[0]]; i !== -1; i = nxt[(i + 1) * 26 + tc[0]]) {
    let pos = i;
    for (let k = 1; k < m && pos !== -1; k++) {
      pos = nxt[(pos + 1) * 26 + tc[k]];
    }
    // If t can't be matched starting here, no later start can match either.
    if (pos === -1) break;
    const len = pos - i + 1;
    if (len < bestLen) {
      bestLen = len;
      bestStart = i;
    }
  }
  return bestStart === -1 ? "" : s.substring(bestStart, bestStart + bestLen);
}
