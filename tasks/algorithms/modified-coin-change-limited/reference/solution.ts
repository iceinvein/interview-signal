export function coinChangeLimited(coins: number[], counts: number[], amount: number): number {
  const fewest = new Array<number>(amount + 1).fill(Infinity);
  fewest[0] = 0;
  for (let i = 0; i < coins.length; i++) {
    // Bundles of 1, 2, 4, ... coins plus a remainder can express every
    // quantity from 0 to counts[i], so each bundle is one 0/1 item.
    let remaining = counts[i];
    for (let bundle = 1; remaining > 0; bundle *= 2) {
      const size = Math.min(bundle, remaining);
      remaining -= size;
      const value = size * coins[i];
      for (let total = amount; total >= value; total--) {
        if (fewest[total - value] + size < fewest[total]) {
          fewest[total] = fewest[total - value] + size;
        }
      }
    }
  }
  return fewest[amount] === Infinity ? -1 : fewest[amount];
}
