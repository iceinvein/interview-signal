export function coinChangeLimited(coins: number[], counts: number[], amount: number): number {
  const dp = Array(amount + 1).fill(Infinity);
  dp[0] = 0;

  for (let i = 0; i < coins.length; i++) {
    const coin = coins[i];
    let count = counts[i];

    // Binary representation: convert bounded knapsack to 0-1 knapsack
    // by grouping coins into powers of 2 (1, 2, 4, 8, ...)
    let multiplier = 1;
    while (count > 0) {
      const use = Math.min(multiplier, count);
      const value = use * coin;

      // 0-1 knapsack: iterate backwards to avoid using same coin multiple times
      for (let j = amount; j >= value; j--) {
        if (dp[j - value] !== Infinity) {
          dp[j] = Math.min(dp[j], dp[j - value] + use);
        }
      }

      count -= use;
      multiplier *= 2;
    }
  }

  return dp[amount] === Infinity ? -1 : dp[amount];
}
