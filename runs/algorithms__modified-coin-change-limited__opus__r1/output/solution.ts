export function coinChangeLimited(coins: number[], counts: number[], amount: number): number {
  if (amount === 0) return 0;
  const INF = 0x3fffffff;
  const dp = new Int32Array(amount + 1).fill(INF);
  dp[0] = 0;

  // Bounded knapsack via binary splitting: each coin type with count n becomes
  // bundles of size 1, 2, 4, ..., remainder, each used at most once (0/1 knapsack).
  for (let i = 0; i < coins.length; i++) {
    const c = coins[i];
    let n = Math.min(counts[i], Math.floor(amount / c));
    let k = 1;
    while (n > 0) {
      const take = Math.min(k, n);
      n -= take;
      k <<= 1;
      const w = take * c;
      for (let s = amount; s >= w; s--) {
        const cand = dp[s - w] + take;
        if (cand < dp[s]) dp[s] = cand;
      }
    }
  }

  return dp[amount] >= INF ? -1 : dp[amount];
}
