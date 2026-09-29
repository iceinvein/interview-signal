let slidingWindowRange: (typeof import("./solution.ts"))["slidingWindowRange"];

beforeAll(async () => {
  ({ slidingWindowRange } = await import("./solution.ts"));
});

function elapsedMs(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe("basic", () => {
  it("returns the range of each window of three", () => {
    expect(slidingWindowRange([1, 3, -1, -3, 5, 3, 6, 7], 3)).toEqual([4, 6, 8, 8, 3, 4]);
  });
  it("tracks an increasing array", () => {
    expect(slidingWindowRange([1, 2, 4, 8], 2)).toEqual([1, 2, 4]);
  });
  it("tracks a decreasing array", () => {
    expect(slidingWindowRange([8, 4, 2, 1], 3)).toEqual([6, 3]);
  });
  it("updates when the minimum and then the maximum leave the window", () => {
    expect(slidingWindowRange([1, 5, 5, 2, 9], 3)).toEqual([4, 3, 7]);
  });
  it("handles alternating values", () => {
    expect(slidingWindowRange([0, 10, 0, 10], 2)).toEqual([10, 10, 10]);
  });
});

describe("edge-cases", () => {
  it("returns zero for a single element", () => {
    expect(slidingWindowRange([5], 1)).toEqual([0]);
  });
  it("returns zeros when the window size is one", () => {
    expect(slidingWindowRange([3, -2, 8], 1)).toEqual([0, 0, 0]);
  });
  it("returns one value when the window covers the whole array", () => {
    expect(slidingWindowRange([4, -1, 9, 2], 4)).toEqual([10]);
  });
  it("returns zeros for all-equal values", () => {
    expect(slidingWindowRange([7, 7, 7], 2)).toEqual([0, 0]);
  });
  it("keeps equal extremes when earlier copies leave", () => {
    expect(slidingWindowRange([2, 9, 2, 9, 9, 9], 3)).toEqual([7, 7, 7, 0]);
  });
  it("handles all-negative values", () => {
    expect(slidingWindowRange([-5, -1, -3, -4], 2)).toEqual([4, 2, 1]);
  });
  it("handles values at both magnitude limits", () => {
    expect(slidingWindowRange([1000000000, -1000000000], 2)).toEqual([2000000000]);
  });
  it("handles a range beyond the 32-bit integer limit", () => {
    expect(slidingWindowRange([-1000000000, 0, 1000000000], 3)).toEqual([2000000000]);
  });
});

describe("performance", () => {
  it("solves an increasing 100000-element array with k = 50000 in under 500 ms", () => {
    // Values rise by 10000 per step, so every window spans 49999 steps.
    const n = 100000;
    const k = 50000;
    const nums = Array.from({ length: n }, (_, i) => i * 10000);
    const expected = new Array(n - k + 1).fill(49999 * 10000);
    let result: number[] = [];
    const ms = elapsedMs(() => {
      result = slidingWindowRange(nums, k);
    });
    expect(result).toEqual(expected);
    expect(ms).toBeLessThan(500);
  });
  it("solves an alternating-sign 100000-element array with k = 50000 in under 500 ms", () => {
    // Even positions hold +i*10000 and odd positions -i*10000, so a window
    // ending at e has its extremes at e and e - 1, a range of (2e - 1)*10000.
    const n = 100000;
    const k = 50000;
    const nums = Array.from({ length: n }, (_, i) => (i % 2 === 0 ? i : -i) * 10000);
    const expected = Array.from({ length: n - k + 1 }, (_, i) => (2 * (i + k - 1) - 1) * 10000);
    let result: number[] = [];
    const ms = elapsedMs(() => {
      result = slidingWindowRange(nums, k);
    });
    expect(result).toEqual(expected);
    expect(ms).toBeLessThan(500);
  });
});
