let coinChange: (typeof import("./solution.ts"))["coinChange"];

beforeAll(async () => {
  ({ coinChange } = await import("./solution.ts"));
});

function elapsedMs(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe("basic", () => {
  it("combines several denominations", () => {
    expect(coinChange([1, 2, 5], 11)).toBe(3);
  });
  it("uses the largest coin repeatedly when that is best", () => {
    expect(coinChange([1, 2, 5], 30)).toBe(6);
  });
  it("accepts denominations in any order", () => {
    expect(coinChange([2, 5, 10, 1], 27)).toBe(4);
  });
  it("beats largest-coin-first when two middle coins suffice", () => {
    expect(coinChange([1, 3, 4], 6)).toBe(2);
  });
  it("beats largest-coin-first when skipping the largest coin is better", () => {
    expect(coinChange([1, 5, 6, 9], 11)).toBe(2);
  });
  it("mixes two denominations that share no factor", () => {
    expect(coinChange([3, 7], 13)).toBe(3);
  });
  it("uses the largest of twelve denominations twice plus one more", () => {
    expect(coinChange([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 25)).toBe(3);
  });
});

describe("edge-cases", () => {
  it("needs no coins for an amount of zero", () => {
    expect(coinChange([5], 0)).toBe(0);
  });
  it("returns -1 when a single coin cannot divide the amount", () => {
    expect(coinChange([2], 3)).toBe(-1);
  });
  it("returns -1 when every coin exceeds the amount", () => {
    expect(coinChange([5, 10], 3)).toBe(-1);
  });
  it("returns -1 when only even coins face an odd amount", () => {
    expect(coinChange([2, 4], 7)).toBe(-1);
  });
  it("returns -1 when no mix of two coprime coins reaches the amount", () => {
    expect(coinChange([3, 7], 11)).toBe(-1);
  });
  it("uses one coin equal to the amount", () => {
    expect(coinChange([7], 7)).toBe(1);
  });
  it("handles a coin at the denomination limit that cannot be used", () => {
    expect(coinChange([2147483647], 2000)).toBe(-1);
  });
  it("falls back to small coins beside a coin at the denomination limit", () => {
    expect(coinChange([2147483647, 1], 3)).toBe(3);
  });
  it("uses only ones when that is the sole denomination", () => {
    expect(coinChange([1], 1000)).toBe(1000);
  });
});

describe("performance", () => {
  it("solves amount 2000 with coins 1, 2 and 5 in under 1000 ms", () => {
    // 5 divides 2000, so 400 fives reach it, and any fewer coins sum to
    // at most 5 * 399 < 2000.
    let result: number | undefined;
    const ms = elapsedMs(() => {
      result = coinChange([1, 2, 5], 2000);
    });
    expect(result).toBe(400);
    expect(ms).toBeLessThan(1000);
  });
  it("rejects an odd amount with twelve even coins in under 1000 ms", () => {
    // Every coin is even, so every sum is even and 1999 is unreachable.
    const coins = Array.from({ length: 12 }, (_, i) => 2 * (i + 1));
    let result: number | undefined;
    const ms = elapsedMs(() => {
      result = coinChange(coins, 1999);
    });
    expect(result).toBe(-1);
    expect(ms).toBeLessThan(1000);
  });
});
