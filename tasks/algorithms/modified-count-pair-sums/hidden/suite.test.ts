let countPairsWithSum: (typeof import("./solution.ts"))["countPairsWithSum"];

beforeAll(async () => {
  ({ countPairsWithSum } = await import("./solution.ts"));
});

function elapsedMs(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe("basic", () => {
  it("counts two distinct pairs", () => {
    expect(countPairsWithSum([1, 2, 3, 4, 5], 5)).toBe(2);
  });
  it("counts pairs in unsorted input", () => {
    expect(countPairsWithSum([1, 5, 7, -1], 6)).toBe(2);
  });
  it("counts the same values at different positions separately", () => {
    expect(countPairsWithSum([1, 5, 7, -1, 5], 6)).toBe(3);
  });
  it("counts pairs that reuse a repeated value", () => {
    expect(countPairsWithSum([3, 1, 4, 1, 5, 9, 2, 6], 10)).toBe(3);
  });
  it("counts a pair whose smaller value comes later", () => {
    expect(countPairsWithSum([4, 1, 4], 5)).toBe(2);
  });
  it("returns zero when no pair sums to the target", () => {
    expect(countPairsWithSum([1, 2, 3], 100)).toBe(0);
  });
});

describe("edge-cases", () => {
  it("returns zero for an empty array", () => {
    expect(countPairsWithSum([], 0)).toBe(0);
  });
  it("does not pair a single element with itself", () => {
    expect(countPairsWithSum([5], 10)).toBe(0);
  });
  it("counts one pair of two equal values", () => {
    expect(countPairsWithSum([5, 5], 10)).toBe(1);
  });
  it("counts every pair among four equal values", () => {
    expect(countPairsWithSum([2, 2, 2, 2], 4)).toBe(6);
  });
  it("counts every pair among zeros with a zero target", () => {
    expect(countPairsWithSum([0, 0, 0], 0)).toBe(3);
  });
  it("does not count a value equal to half the target that appears once", () => {
    expect(countPairsWithSum([3, 7, 5], 10)).toBe(1);
  });
  it("handles negative values and a negative target", () => {
    expect(countPairsWithSum([-1, -2, -3, -4], -5)).toBe(2);
  });
  it("counts every cross pair of opposite values", () => {
    expect(countPairsWithSum([-5, 5, -5, 5], 0)).toBe(4);
  });
  it("handles values at the magnitude limit", () => {
    expect(countPairsWithSum([1000000000, 1000000000, -1000000000], 0)).toBe(2);
  });
  it("handles a target at the magnitude limit", () => {
    expect(countPairsWithSum([500000000, 500000000, 500000000], 1000000000)).toBe(3);
  });
});

describe("performance", () => {
  it("counts about five billion pairs among 100000 equal values in under 500 ms", () => {
    // Every one of the n * (n - 1) / 2 position pairs sums to the target.
    const n = 100000;
    const nums = new Array<number>(n).fill(7);
    let result: number | undefined;
    const ms = elapsedMs(() => {
      result = countPairsWithSum(nums, 14);
    });
    expect(result).toBe(4999950000);
    expect(ms).toBeLessThan(500);
  });
  it("counts pairs among 100000 distinct values in under 500 ms", () => {
    // Values 0..n-1 with target n-1 pair up as (k, n-1-k), giving n / 2 pairs.
    const n = 100000;
    const nums = Array.from({ length: n }, (_, i) => i);
    let result: number | undefined;
    const ms = elapsedMs(() => {
      result = countPairsWithSum(nums, n - 1);
    });
    expect(result).toBe(50000);
    expect(ms).toBeLessThan(500);
  });
});
