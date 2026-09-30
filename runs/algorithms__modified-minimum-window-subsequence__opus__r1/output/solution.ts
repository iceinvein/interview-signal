export function minWindowSubsequence(s: string, t: string): string {
  const n = s.length;
  const m = t.length;
  // nxt[i * 26 + c] = smallest index j >= i with s[j] === c, or -1.
  const nxt = new Int32Array((n + 1) * 26).fill(-1);
  for (let i = n - 1; i >= 0; i--) {
    nxt.copyWithin(i * 26, (i + 1) * 26, (i + 2) * 26);
    nxt[i * 26 + s.charCodeAt(i) - 97] = i;
  }
  const tc = new Int32Array(m);
  for (let k = 0; k < m; k++) tc[k] = t.charCodeAt(k) - 97;

  let bestStart = -1;
  let bestLen = Infinity;
  for (let i = 0; i < n; i++) {
    if (s.charCodeAt(i) - 97 !== tc[0]) continue;
    let pos = i;
    let k = 1;
    for (; k < m; k++) {
      pos = nxt[(pos + 1) * 26 + tc[k]];
      if (pos === -1) break;
      if (pos - i + 1 >= bestLen) break;
    }
    if (k < m) {
      if (pos === -1) break; // no later start can succeed either
      continue;
    }
    const len = pos - i + 1;
    if (len < bestLen) {
      bestLen = len;
      bestStart = i;
    }
  }
  return bestStart === -1 ? "" : s.substring(bestStart, bestStart + bestLen);
}
