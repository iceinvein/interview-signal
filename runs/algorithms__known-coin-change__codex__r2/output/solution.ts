export function coinChange(coins: number[], amount: number): number {
  const minCoins = new Array<number>(amount + 1).fill(Infinity);
  minCoins[0] = 0;

  for (let value = 1; value <= amount; value++) {
    for (const coin of coins) {
      if (coin <= value) {
        minCoins[value] = Math.min(minCoins[value], minCoins[value - coin] + 1);
      }
    }
  }

  return minCoins[amount] === Infinity ? -1 : minCoins[amount];
}
