export function longestBalancedRun(s: string): number {
  const n = s.length;
  const firstSeen = new Int32Array(2 * n + 1);
  const offset = n;

  // Store each prefix position plus one; zero means the balance is unseen.
  firstSeen[offset] = 1;

  let balance = 0;
  let longest = 0;

  for (let i = 0; i < n; i++) {
    const code = s.charCodeAt(i);
    if (code === 120) balance++; // 'x'
    else if (code === 121) balance--; // 'y'

    const slot = offset + balance;
    const first = firstSeen[slot];
    if (first === 0) {
      firstSeen[slot] = i + 2;
    } else {
      const length = i + 2 - first;
      if (length > longest) longest = length;
    }
  }

  return longest;
}
