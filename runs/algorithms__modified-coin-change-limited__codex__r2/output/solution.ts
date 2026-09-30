export function coinChangeLimited(coins: number[], counts: number[], amount: number): number {
  if (amount === 0) return 0;

  // Any valid solution uses at most `amount` coins, since every coin is positive.
  const unreachable = amount + 1;
  const dp = new Int32Array(amount + 1);
  dp.fill(unreachable);
  dp[0] = 0;

  for (let i = 0; i < coins.length; i++) {
    const value = coins[i];
    let remaining = Math.min(counts[i], Math.floor(amount / value));

    // Split the supply into 0/1 groups whose sizes can form every count
    // from zero through the available number of coins.
    for (let group = 1; remaining > 0; group *= 2) {
      const used = Math.min(group, remaining);
      const weight = used * value;

      for (let sum = amount; sum >= weight; sum--) {
        const candidate = dp[sum - weight] + used;
        if (candidate < dp[sum]) dp[sum] = candidate;
      }

      remaining -= used;
    }
  }

  return dp[amount] === unreachable ? -1 : dp[amount];
}
