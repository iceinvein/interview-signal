export function coinChangeLimited(coins: number[], counts: number[], amount: number): number {
  const dp = new Array<number>(amount + 1).fill(Infinity);
  dp[0] = 0;

  for (let i = 0; i < coins.length; i++) {
    const coin = coins[i];
    let remaining = Math.min(counts[i], Math.floor(amount / coin));
    let bundleSize = 1;

    while (remaining > 0) {
      const used = Math.min(bundleSize, remaining);
      const bundleValue = used * coin;

      // Descending amounts make each bundle available at most once.
      for (let value = amount; value >= bundleValue; value--) {
        dp[value] = Math.min(dp[value], dp[value - bundleValue] + used);
      }

      remaining -= used;
      bundleSize *= 2;
    }
  }

  return dp[amount] === Infinity ? -1 : dp[amount];
}
