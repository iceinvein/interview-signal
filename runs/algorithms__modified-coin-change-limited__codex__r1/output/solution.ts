export function coinChangeLimited(coins: number[], counts: number[], amount: number): number {
  if (amount === 0) return 0;

  let dp = new Array<number>(amount + 1).fill(Infinity);
  dp[0] = 0;
  const deque = new Int32Array(amount + 1);

  for (let i = 0; i < coins.length; i++) {
    const coin = coins[i];
    const limit = Math.min(counts[i], Math.floor(amount / coin));
    if (limit === 0) continue;

    const next = new Array<number>(amount + 1).fill(Infinity);

    // For sums r + j * coin, choosing j - k coins costs dp[r + k * coin] + j - k.
    // Keep the minimum dp[r + k * coin] - k over the allowed window of k values.
    for (let r = 0; r < coin && r <= amount; r++) {
      let head = 0;
      let tail = 0;

      for (let j = 0, sum = r; sum <= amount; j++, sum += coin) {
        while (head < tail && deque[head] < j - limit) head++;

        if (dp[sum] !== Infinity) {
          const score = dp[sum] - j;
          while (head < tail && dp[r + deque[tail - 1] * coin] - deque[tail - 1] >= score) {
            tail--;
          }
          deque[tail++] = j;
        }

        if (head < tail) {
          const k = deque[head];
          next[sum] = dp[r + k * coin] + j - k;
        }
      }
    }

    dp = next;
  }

  return dp[amount] === Infinity ? -1 : dp[amount];
}
