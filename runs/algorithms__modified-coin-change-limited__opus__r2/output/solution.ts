export function coinChangeLimited(coins: number[], counts: number[], amount: number): number {
  if (amount === 0) return 0;
  const INF = 0x3fffffff;
  const dp = new Int32Array(amount + 1).fill(INF);
  dp[0] = 0;

  for (let i = 0; i < coins.length; i++) {
    const c = coins[i];
    if (c > amount) continue;
    // No point using more coins than could fit in amount.
    let remaining = Math.min(counts[i], Math.floor(amount / c));
    // Binary splitting: bundles of 1, 2, 4, ... coins, each used at most once (0/1 knapsack).
    for (let k = 1; remaining > 0; k <<= 1) {
      const take = Math.min(k, remaining);
      remaining -= take;
      const w = take * c;
      for (let s = amount; s >= w; s--) {
        const cand = dp[s - w] + take;
        if (cand < dp[s]) dp[s] = cand;
      }
    }
  }

  return dp[amount] >= INF ? -1 : dp[amount];
}
