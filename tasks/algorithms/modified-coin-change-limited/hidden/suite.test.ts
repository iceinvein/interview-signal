let coinChangeLimited: (typeof import("./solution.ts"))["coinChangeLimited"];

beforeAll(async () => {
  ({ coinChangeLimited } = await import("./solution.ts"));
});

function elapsedMs(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe("basic", () => {
  it("combines denominations when supply is not binding", () => {
    expect(coinChangeLimited([1, 2, 5], [5, 5, 1], 11)).toBe(4);
  });
  it("uses more small coins once the large coin runs out", () => {
    expect(coinChangeLimited([1, 5], [10, 1], 10)).toBe(6);
  });
  it("beats largest-coin-first when two middle coins suffice", () => {
    expect(coinChangeLimited([1, 3, 4], [6, 2, 1], 6)).toBe(2);
  });
  it("falls back when only one middle coin is available", () => {
    expect(coinChangeLimited([1, 3, 4], [6, 1, 2], 6)).toBe(3);
  });
  it("uses every available coin when that is the only way", () => {
    expect(coinChangeLimited([2, 7], [3, 2], 20)).toBe(5);
  });
  it("uses exactly the available count of one denomination", () => {
    expect(coinChangeLimited([7], [3], 21)).toBe(3);
  });
});

describe("edge-cases", () => {
  it("needs no coins for an amount of zero", () => {
    expect(coinChangeLimited([3], [0], 0)).toBe(0);
  });
  it("returns -1 when a repeat of the only coin is not available", () => {
    expect(coinChangeLimited([5], [1], 10)).toBe(-1);
  });
  it("returns -1 when the supply of one denomination falls one coin short", () => {
    expect(coinChangeLimited([7], [3], 28)).toBe(-1);
  });
  it("returns -1 when each denomination may be used only once", () => {
    expect(coinChangeLimited([2, 3], [1, 1], 4)).toBe(-1);
  });
  it("uses one of each when that is enough", () => {
    expect(coinChangeLimited([2, 3], [1, 1], 5)).toBe(2);
  });
  it("treats a count of zero as removing that coin", () => {
    expect(coinChangeLimited([1, 5], [3, 0], 5)).toBe(-1);
  });
  it("reaches the amount without the removed coin when others suffice", () => {
    expect(coinChangeLimited([1, 5], [5, 0], 5)).toBe(5);
  });
  it("returns -1 when every count is zero and the amount is positive", () => {
    expect(coinChangeLimited([1, 2], [0, 0], 1)).toBe(-1);
  });
  it("uses one coin at the denomination limit", () => {
    expect(coinChangeLimited([10000], [1], 10000)).toBe(1);
  });
  it("uses the full supply of ones at the limits", () => {
    expect(coinChangeLimited([1], [10000], 10000)).toBe(10000);
  });
});

describe("performance", () => {
  it("solves twelve denominations with large supplies in under 200 ms", () => {
    // Only 100 twelves exist, so k coins sum to at most 1200 + 11(k - 100);
    // reaching 10000 needs k >= 900, and 100 twelves plus 800 elevens hit it.
    const coins = Array.from({ length: 12 }, (_, i) => i + 1);
    const counts = coins.map((coin) => (coin === 12 ? 100 : 10000));
    let result: number | undefined;
    const ms = elapsedMs(() => {
      result = coinChangeLimited(coins, counts, 10000);
    });
    expect(result).toBe(900);
    expect(ms).toBeLessThan(200);
  });
  it("rejects an odd amount with twelve even coins in large supply in under 200 ms", () => {
    // Every coin is even, so every sum is even and 9999 is unreachable.
    const coins = Array.from({ length: 12 }, (_, i) => 2 * (i + 1));
    const counts = coins.map(() => 10000);
    let result: number | undefined;
    const ms = elapsedMs(() => {
      result = coinChangeLimited(coins, counts, 9999);
    });
    expect(result).toBe(-1);
    expect(ms).toBeLessThan(200);
  });
});
