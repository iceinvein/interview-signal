export function coinChangeLimited(coins: number[], counts: number[], amount: number): number {
  if (amount === 0) return 0;

  let dp = Array(amount + 1).fill(Infinity);
  dp[0] = 0;

  // Process each coin type with its limited count
  for (let i = 0; i < coins.length; i++) {
    const coin = coins[i];
    const count = counts[i];
    const newDp = dp.slice();

    // Update dp for each possible amount
    for (let j = coin; j <= amount; j++) {
      // Try using this coin 1 to count times
      for (let use = 1; use <= count && use * coin <= j; use++) {
        if (dp[j - use * coin] !== Infinity) {
          newDp[j] = Math.min(newDp[j], dp[j - use * coin] + use);
        }
      }
    }

    dp = newDp;
  }

  return dp[amount] === Infinity ? -1 : dp[amount];
}
