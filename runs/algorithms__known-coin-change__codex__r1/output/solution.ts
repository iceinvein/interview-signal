export function coinChange(coins: number[], amount: number): number {
  const minimum = new Array<number>(amount + 1).fill(Infinity);
  minimum[0] = 0;

  for (let total = 1; total <= amount; total++) {
    for (const coin of coins) {
      if (coin <= total) {
        minimum[total] = Math.min(minimum[total], minimum[total - coin] + 1);
      }
    }
  }

  return minimum[amount] === Infinity ? -1 : minimum[amount];
}
